import { app, dialog, globalShortcut, ipcMain, net, protocol } from 'electron';
import { pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

import { IPC } from '@shared/ipc';
import type { DebugSnapshot, FrequencyProfile, Settings } from '@shared/types';

import { EventBus } from './core/eventBus';
import {
  ALL_EVENT_TYPES,
  createEvent,
  defaultPriorityFor,
  EventType,
  type AppEvent
} from './core/events';
import {
  CooldownKey,
  CooldownLedger,
  createDurationResolver,
  FREQUENCY_MULTIPLIER
} from './core/cooldown';
import { RecentHistory } from './core/selector';
import { PhraseBankError, loadPhraseBank, type PhraseBankIndex } from './core/phraseBank';
import { TriggerEngine } from './core/triggerEngine';
import { SpeechDirector } from './core/speechDirector';
import { RuntimeState, type SnoozeChoice } from './core/runtimeState';
import {
  DEFAULT_BOOT_GRACE_MS,
  evaluateSuppression,
  type SuppressionState
} from './core/suppression';

import { SharedScheduler } from './monitors/Monitor';
import { SystemMonitor } from './monitors/systemMonitor';
import { ProcessMonitor } from './monitors/processMonitor';
import { IdleMonitor } from './monitors/idleMonitor';
import { ScheduleMonitor } from './monitors/scheduleMonitor';
import { SessionMonitor } from './monitors/sessionMonitor';
import { FileMonitor } from './monitors/fileMonitor';
import type { Monitor } from './monitors/Monitor';

import { OverlayWindow } from './window/overlayWindow';
import { debugWindow, settingsWindow } from './window/panelWindows';
import { CodexTray, isDevBuild, startTrayRefreshLoop } from './tray/tray';
import { PresenceProbe } from './system/presenceProbe';
import { processListerFor, systemQueriesFor } from './system/systemQueries';
import { SettingsStore, defaultSettings } from './settings/settings';
import { StateStore } from './settings/stateStore';
import { configureLogger, createLogger } from './log/logger';
import { NullVoiceEngine } from './voice/NullVoiceEngine';
import { AUDIO_SCHEME, PrerenderedVoiceEngine, audioDirHasFiles } from './voice/PrerenderedVoiceEngine';
import { resolveCueSources } from './voice/cueAudio';
import type { VoiceEngine } from './voice/VoiceEngine';
import { paths } from './paths';

const log = createLogger('main');

/** The group the tray's "Say something now" draws from. */
const UNPROMPTED_GROUP = 'ambient.unprompted';
/** Phase 2's command palette gets a home now so it costs nothing later (§19). */
const COMMAND_PALETTE_ACCELERATOR = 'CommandOrControl+Alt+Shift+C';

// A Web Audio context in a page that never receives a click stays suspended
// under Chromium's default autoplay policy, and the overlay is click-through:
// it can never get that gesture. Without this the appear/disappear cues are
// silent in a packaged build while working fine in the design harness.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Must run before `app.whenReady` — the overlay loads audio through this scheme.
protocol.registerSchemesAsPrivileged([
  { scheme: AUDIO_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
]);

if (!app.requestSingleInstanceLock()) {
  app.exit(0);
} else {
  void bootstrap();
}

async function bootstrap(): Promise<void> {
  await app.whenReady();

  configureLogger({ directory: paths.logDir(), level: isDevBuild() ? 'debug' : 'info' });
  app.setAppUserModelId('dev.codex.companion');

  /* ---------------------------------------------------------------- */
  /* Phrase bank — a schema violation is a fatal startup error (§6).   */
  /* ---------------------------------------------------------------- */
  let bank: PhraseBankIndex;
  try {
    bank = loadPhraseBank(paths.phraseBank());
    log.info(`phrase bank loaded: ${bank.phraseCount} phrases in ${bank.groupIds().length} groups`);
  } catch (err) {
    const message = err instanceof PhraseBankError ? err.message : String(err);
    log.error(message);
    dialog.showErrorBox('SHARD cannot start', message);
    app.exit(1);
    return;
  }

  /* ---------------------------------------------------------------- */
  /* Settings and persisted state                                      */
  /* ---------------------------------------------------------------- */
  const settingsStore = new SettingsStore(
    paths.settingsFile(),
    defaultSettings(safeDownloadsPath())
  );

  const ledger = new CooldownLedger(
    createDurationResolver(() => FREQUENCY_MULTIPLIER[settingsStore.current.frequencyProfile])
  );
  const history = new RecentHistory();
  const stateStore = new StateStore(paths.stateFile(), ledger, history);
  const bootAt = Date.now();
  const firstRun = stateStore.load(bootAt);

  /* ---------------------------------------------------------------- */
  /* Windows, tray, probes                                             */
  /* ---------------------------------------------------------------- */
  const runtime = new RuntimeState();
  const overlay = new OverlayWindow();
  overlay.create(OverlayWindow.preloadPath());
  overlay.setOffsets(settingsStore.current.overlay);
  overlay.setSkin(settingsStore.current.skinId);

  // Files win over the synthesised cues, checked once here — same bargain as
  // the voice engine, and the same restart to pick a new one up.
  const cues = resolveCueSources(paths.cueDir());
  overlay.setCues(cues);
  log.info(
    `overlay cues: appear ${cues.appear ? 'file' : 'synthesised'}, ` +
      `disappear ${cues.disappear ? 'file' : 'synthesised'}`
  );

  const probe = new PresenceProbe(paths.probeDir());
  probe.start();

  registerAudioProtocol();

  const getSuppression = (now: number): SuppressionState =>
    evaluateSuppression({
      now,
      muted: runtime.isMuted,
      snoozedUntil: normaliseSnooze(runtime.snoozeUntil(now)),
      quietHours: settingsStore.current.quietHours,
      suppressOnFullscreen: settingsStore.current.suppressOnFullscreen,
      fullscreenActive: probe.fullscreenActive,
      suppressOnMicrophoneUse: settingsStore.current.suppressOnMicrophoneUse,
      microphoneActive: probe.microphoneActive,
      bootAt,
      bootGraceMs: DEFAULT_BOOT_GRACE_MS
    });

  /* ---------------------------------------------------------------- */
  /* Voice engine — selection is automatic (§14.3)                     */
  /* ---------------------------------------------------------------- */
  // Criterion 12 says dropping a `<phraseId>.ogg` in here must be enough, so
  // the folder has to exist even when the build shipped it empty.
  try {
    mkdirSync(paths.audioDir(), { recursive: true });
  } catch (err) {
    log.warn(`cannot create audio directory: ${(err as Error).message}`);
  }

  // The prerendered engine needs the director to learn when playback ended,
  // and the director needs the engine to speak. One holder breaks the knot.
  const directorRef: { current: SpeechDirector | null } = { current: null };

  const voice: VoiceEngine = audioDirHasFiles(paths.audioDir())
    ? new PrerenderedVoiceEngine({
        audioDir: paths.audioDir(),
        awaitPlayback: (phraseId, timeoutMs) =>
          directorRef.current?.awaitPlaybackAck(phraseId, timeoutMs) ?? Promise.resolve(),
        logDebug: (message) => log.debug(message)
      })
    : new NullVoiceEngine();
  log.info(`voice engine: ${voice.available ? 'prerendered audio' : 'text only'}`);

  const director = new SpeechDirector({
    bank,
    ledger,
    history,
    voice,
    overlay,
    getSuppression,
    getConditionContext: (now) => ({
      uptimeMinutes: (now - bootAt) / 60_000,
      firstRun
    }),
    logDebug: (message) => log.debug(message),
    logInfo: (message) => log.info(message)
  });
  directorRef.current = director;
  director.start();

  /* ---------------------------------------------------------------- */
  /* Event pipeline                                                    */
  /* ---------------------------------------------------------------- */
  const bus = new EventBus();
  const triggers = new TriggerEngine(bank);

  const dangling = triggers.danglingRules();
  if (dangling.length > 0) {
    log.error(
      `trigger rules reference missing phrase groups: ${dangling
        .map((entry) => `${entry.ruleId} → ${entry.groupId}`)
        .join(', ')}`
    );
  }

  bus.on('*', (event: AppEvent) => {
    const now = Date.now();
    const candidates = triggers.match(event, {
      uptimeMinutes: (now - bootAt) / 60_000,
      firstRun
    });
    for (const candidate of candidates) {
      director.submit({
        origin: 'trigger',
        groupId: candidate.groupId,
        category: candidate.category,
        priority: candidate.priority,
        ruleId: candidate.ruleId,
        event: candidate.event,
        bypassBootGrace: candidate.event.type === EventType.sessionStartup
      });
    }
    stateStore.scheduleSave();
    pushDebugSnapshot();
  });

  /* ---------------------------------------------------------------- */
  /* Monitors                                                          */
  /* ---------------------------------------------------------------- */
  const scheduler = new SharedScheduler(5_000);
  const idleMonitor = new IdleMonitor(scheduler);

  const monitors: Record<string, Monitor> = {
    // Both of these read the machine through the probe host that is already
    // running — see `systemQueries` for what that replaced and why.
    system: new SystemMonitor(scheduler, systemQueriesFor(probe)),
    process: new ProcessMonitor(
      scheduler,
      () => settingsStore.current.watchedProcesses,
      processListerFor(probe)
    ),
    idle: idleMonitor,
    schedule: new ScheduleMonitor(
      scheduler,
      () => idleMonitor.isIdle,
      // The `global` stamp is exactly "when Codex last spoke", and it is
      // persisted, so a restart does not reset the silence timer.
      () => ledger.lastFiredAt(CooldownKey.global()),
      () => FREQUENCY_MULTIPLIER[settingsStore.current.frequencyProfile]
    ),
    session: new SessionMonitor(),
    file: new FileMonitor(() => settingsStore.current.watchedFolders)
  };

  const started = new Set<string>();
  const syncMonitors = async (settings: Settings): Promise<void> => {
    for (const [id, monitor] of Object.entries(monitors)) {
      const wanted = settings.monitors[id] !== false;
      if (wanted && !started.has(id)) {
        await monitor.start(bus);
        started.add(id);
        log.info(`monitor started: ${id}`);
      } else if (!wanted && started.has(id)) {
        await monitor.stop();
        started.delete(id);
        log.info(`monitor stopped: ${id}`);
      }
    }
  };

  await syncMonitors(settingsStore.current);
  scheduler.start();

  /* ---------------------------------------------------------------- */
  /* Tray                                                              */
  /* ---------------------------------------------------------------- */
  const tray = new CodexTray({
    iconPath: CodexTray.defaultIconPath(paths.iconsDir()),
    state: runtime,
    getFrequency: () => settingsStore.current.frequencyProfile,
    isDev: isDevBuild(),
    actions: {
      saySomethingNow: () => {
        director.submit({
          origin: 'tray',
          groupId: UNPROMPTED_GROUP,
          category: 'ambient',
          priority: 'notable',
          bypassCooldowns: true,
          bypassSuppression: true
        });
      },
      setSnooze: (choice: SnoozeChoice) => runtime.setSnooze(choice, Date.now()),
      setFrequency: (profile: FrequencyProfile) =>
        settingsStore.update({ frequencyProfile: profile }),
      openSettings: () => settingsWindow.open(),
      openDebug: () => debugWindow.open(),
      quit: () => {
        quitting = true;
        app.quit();
      }
    }
  });
  tray.create();
  const stopTrayLoop = startTrayRefreshLoop(tray);

  runtime.onChange((state) => {
    overlay.sendState(state);
    tray.refresh();
    if (state.muted) director.interrupt();
  });

  settingsStore.onChange((settings) => {
    overlay.setOffsets(settings.overlay);
    overlay.setSkin(settings.skinId);
    void syncMonitors(settings);
    reconcileAutostart(settings.startWithSystem);
    settingsWindow.send(IPC.settingsUpdated, settings);
    tray.refresh();
  });

  reconcileAutostart(settingsStore.current.startWithSystem);

  /* ---------------------------------------------------------------- */
  /* IPC — every renderer→main payload is validated (§12)              */
  /* ---------------------------------------------------------------- */
  const speechAckSchema = z.object({ speechId: z.string().min(1) });

  ipcMain.on(IPC.overlaySetInteractive, (_event, payload: unknown) => {
    if (typeof payload !== 'boolean') return;
    overlay.setInteractive(payload);
  });

  ipcMain.on(IPC.speechFinished, (_event, payload: unknown) => {
    const parsed = speechAckSchema.safeParse(payload);
    if (!parsed.success) return;
    director.finish(parsed.data.speechId);
  });

  ipcMain.on(IPC.speechDismissed, (_event, payload: unknown) => {
    const parsed = speechAckSchema.safeParse(payload);
    if (!parsed.success) return;
    director.dismiss(parsed.data.speechId);
  });

  ipcMain.handle(IPC.settingsGet, () => settingsStore.current);

  ipcMain.handle(IPC.settingsSet, (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') return settingsStore.current;
    return settingsStore.update(payload as Partial<Settings>);
  });

  ipcMain.handle(IPC.debugRequestSnapshot, () => buildDebugSnapshot());

  ipcMain.on(IPC.debugFireEvent, (_event, payload: unknown) => {
    const parsed = z.object({ type: z.string().min(1) }).safeParse(payload);
    if (!parsed.success) return;
    const type = parsed.data.type;
    bus.emit(createEvent(type, defaultPriorityFor(type), syntheticPayload(type), Date.now()));
  });

  /* ---------------------------------------------------------------- */
  /* Global shortcut seam (§19)                                        */
  /* ---------------------------------------------------------------- */
  try {
    const registered = globalShortcut.register(COMMAND_PALETTE_ACCELERATOR, () => {
      // Phase 2 opens the command palette here.
      log.debug('command palette shortcut pressed (no-op in Phase 1)');
    });
    if (!registered) log.warn(`could not register ${COMMAND_PALETTE_ACCELERATOR}`);
  } catch (err) {
    log.warn(`global shortcut registration failed: ${String(err)}`);
  }

  /* ---------------------------------------------------------------- */
  /* Lifecycle                                                         */
  /* ---------------------------------------------------------------- */
  let quitting = false;

  // The app never quits from window state.
  app.on('window-all-closed', () => {
    /* no-op by design */
  });

  app.on('second-instance', () => {
    // Deliberately does nothing: a second launch focuses nothing and exits.
  });

  app.on('before-quit', () => {
    quitting = true;
    stopTrayLoop();
    stateStore.save();
    director.stop();
    scheduler.stop();
    probe.stop();
    for (const monitor of Object.values(monitors)) void monitor.stop();
    globalShortcut.unregisterAll();
    tray.destroy();
  });

  process.on('exit', () => {
    if (!quitting) stateStore.save();
  });

  log.info(`Codex ready (first run: ${firstRun})`);

  /* ---------------------------------------------------------------- */
  /* Helpers that need the closure                                     */
  /* ---------------------------------------------------------------- */

  function buildDebugSnapshot(): DebugSnapshot {
    const now = Date.now();
    const suppression = getSuppression(now);
    return {
      events: bus.recent(100).map((event) => ({
        id: event.id,
        type: event.type,
        at: event.at,
        priority: event.priority,
        payload: event.payload
      })),
      cooldowns: ledger.active(now),
      suppression: {
        suppressed: suppression.suppressed,
        reason: suppression.reasons.join(', ') || null,
        hardMute: suppression.hardMute
      },
      deferred: director.deferredSnapshot(),
      knownEventTypes: ALL_EVENT_TYPES,
      frequencyProfile: settingsStore.current.frequencyProfile
    };
  }

  function pushDebugSnapshot(): void {
    if (!debugWindow.browserWindow) return;
    debugWindow.send(IPC.debugSnapshot, buildDebugSnapshot());
  }

  // Keep the debug panel live even when the bus is quiet.
  const debugTimer = setInterval(() => pushDebugSnapshot(), 2_000);
  debugTimer.unref?.();
}

/* ------------------------------------------------------------------ */
/* Module-level helpers                                                */
/* ------------------------------------------------------------------ */

function normaliseSnooze(value: number | null): number | null {
  if (value === null) return null;
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}

function safeDownloadsPath(): string {
  try {
    return app.getPath('downloads');
  } catch {
    return '';
  }
}

/** Sample payloads so debug-fired events exercise the same conditions. */
function syntheticPayload(type: string): Record<string, unknown> {
  switch (type) {
    case EventType.sessionIdleExit:
      return { awayMs: 45 * 60_000, synthetic: true };
    case EventType.systemCpuHigh:
    case EventType.systemCpuSustained:
      return { load: 93, synthetic: true };
    case EventType.systemMemoryHigh:
      return { usedPercent: 94, synthetic: true };
    case EventType.systemTemperatureHigh:
      return { celsius: 91, synthetic: true };
    case EventType.systemDiskLow:
      return { mount: 'C:', freeGb: 4.2, synthetic: true };
    case EventType.systemBatteryLow:
      return { percent: 14, synthetic: true };
    case EventType.processStarted:
    case EventType.processStopped:
      return { name: 'Code.exe', synthetic: true };
    case EventType.processLongRunning:
      return { name: 'Code.exe', hours: 5, synthetic: true };
    case EventType.scheduleWorkBreak:
      return { activeMinutes: 92, synthetic: true };
    case EventType.scheduleUptimeMilestone:
      return { hours: 24, synthetic: true };
    case EventType.fileDownloadComplete:
    case EventType.fileBuildComplete:
      return { name: 'artifact.zip', count: 1, synthetic: true };
    default:
      return { synthetic: true };
  }
}

/**
 * Serves `codex-audio://phrase/<id>.ogg` from `resources/audio`, and
 * `codex-audio://cue/<name>.<ext>` from `resources/audio/cues`. The host is
 * the only thing that picks the directory; any other host is refused.
 */
function registerAudioProtocol(): void {
  protocol.handle(AUDIO_SCHEME, async (request) => {
    try {
      const url = new URL(request.url);
      const root =
        url.host === 'phrase' ? paths.audioDir() : url.host === 'cue' ? paths.cueDir() : null;
      if (!root) return new Response('not found', { status: 404 });
      const fileName = decodeURIComponent(url.pathname.replace(/^\//, ''));
      // Path traversal guard: only a bare filename is ever valid here.
      if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
        return new Response('forbidden', { status: 403 });
      }
      const filePath = join(root, fileName);
      return await net.fetch(pathToFileURL(filePath).toString());
    } catch (err) {
      log.debug(`audio protocol failed: ${String(err)}`);
      return new Response('not found', { status: 404 });
    }
  });
}

/** §11 — read the real value and reconcile, rather than assuming. */
function reconcileAutostart(wanted: boolean): void {
  try {
    const current = app.getLoginItemSettings({ args: ['--hidden'] });
    if (current.openAtLogin === wanted) return;
    app.setLoginItemSettings({ openAtLogin: wanted, args: ['--hidden'] });
    log.info(`autostart set to ${wanted}`);
  } catch (err) {
    log.warn(`cannot reconcile autostart: ${String(err)}`);
  }
}
