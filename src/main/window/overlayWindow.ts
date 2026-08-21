import { BrowserWindow, screen } from 'electron';
import { join } from 'node:path';
import { IPC } from '@shared/ipc';
import type { CueSources, SkinId, SpeechShowPayload, StatePayload } from '@shared/types';
import type { OverlayPresenter } from '../core/speechDirector';
import { createLogger } from '../log/logger';
import { ClickThroughController } from './clickThrough';
import { OVERLAY_HEIGHT, OVERLAY_WIDTH, positionOverlay } from './positioning';
import { loadPage } from './rendererUrl';

const log = createLogger('overlay');

/**
 * Long enough for the whole exit to finish before the window goes: the text
 * fades over 140 ms and only then does the unit slide out over 260 ms (§5).
 */
const EXIT_ANIMATION_MS = 420;

export class OverlayWindow implements OverlayPresenter {
  private win: BrowserWindow | null = null;
  private clickThrough: ClickThroughController | null = null;
  private hideTimer: NodeJS.Timeout | null = null;
  private offsets = { offsetX: 0, offsetY: 0 };
  private ready = false;
  private pending: SpeechShowPayload | null = null;
  private skinId: SkinId = 'eye';
  private cues: CueSources = { appear: null, disappear: null };
  private presetName = 'Ordis';
  private appearanceVideoUrl: string | null = null;
  private cueVolume = 1;
  private appearSoundEnabled = true;
  private disappearSoundEnabled = true;
  private runtimeState: Omit<
    StatePayload,
    'skinId' | 'cues' | 'presetName' | 'appearanceVideoUrl' | 'cueVolume' | 'appearSoundEnabled' | 'disappearSoundEnabled'
  > = {
    muted: false,
    snoozedUntil: null
  };

  create(preloadPath: string): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win;

    // Created once at startup and never destroyed — creating a transparent
    // window on demand causes a visible white flash on Windows (§10).
    const win = new BrowserWindow({
      width: OVERLAY_WIDTH,
      height: OVERLAY_HEIGHT,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      // Without this the overlay steals focus from games and text fields.
      focusable: false,
      hasShadow: false,
      show: false,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false
      }
    });

    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setMenuBarVisibility(false);

    win.webContents.on('did-finish-load', () => {
      this.ready = true;
      // The renderer defaults to the persona's skin until told otherwise, so
      // a non-default choice has to arrive without waiting for a state change.
      this.pushState();
      if (this.pending) {
        const payload = this.pending;
        this.pending = null;
        this.show(payload);
      }
    });

    // Nothing in the overlay may navigate or open windows.
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event) => event.preventDefault());

    // A broken preload or renderer is otherwise completely silent: the
    // director keeps deciding to speak and nothing ever appears on screen.
    win.webContents.on('preload-error', (_event, preload, error) => {
      log.error(`preload failed (${preload}): ${error.message}`);
    });
    win.webContents.on('did-fail-load', (_event, code, description, url) => {
      log.error(`overlay failed to load (${code} ${description}) ${url}`);
    });
    win.webContents.on('render-process-gone', (_event, details) => {
      log.error(`overlay renderer gone: ${details.reason}`);
    });
    win.webContents.on('console-message', (event) => {
      if (event.level === 'error' || event.level === 'warning') {
        log.warn(`overlay console: ${event.message}`);
      }
    });

    this.win = win;
    // Owns click-through, including when the mouse hook goes in — see there.
    this.clickThrough = new ClickThroughController(win);

    void loadPage(win, 'index').catch((err) => log.error(`failed to load overlay: ${String(err)}`));

    screen.on('display-metrics-changed', () => this.reposition());
    screen.on('display-removed', () => this.reposition());

    return win;
  }

  get browserWindow(): BrowserWindow | null {
    return this.win && !this.win.isDestroyed() ? this.win : null;
  }

  setOffsets(offsets: { offsetX: number; offsetY: number }): void {
    this.offsets = offsets;
    if (this.browserWindow?.isVisible()) this.reposition();
  }

  setInteractive(interactive: boolean): void {
    this.clickThrough?.request(interactive);
  }

  /**
   * Everything the active preset determines: its skin (settings values, not
   * runtime ones, so merged in here rather than threaded through
   * `RuntimeState`), its cue sounds and its display name, plus a custom
   * appearance video if it has one — which replaces the skin entirely.
   * Resolved by main whenever the active preset changes (or on startup) and
   * pushed together, so the renderer never has to reconcile a partial update.
   */
  setPreset(preset: {
    name: string;
    skinId: SkinId;
    cues: CueSources;
    videoUrl: string | null;
  }): void {
    const unchanged =
      preset.name === this.presetName &&
      preset.skinId === this.skinId &&
      preset.videoUrl === this.appearanceVideoUrl &&
      preset.cues.appear === this.cues.appear &&
      preset.cues.disappear === this.cues.disappear;
    if (unchanged) return;

    this.presetName = preset.name;
    this.skinId = preset.skinId;
    this.cues = preset.cues;
    this.appearanceVideoUrl = preset.videoUrl;
    this.pushState();
  }

  /**
   * The user's cue volume and per-cue on/off, from `Settings.overlay`. Global
   * rather than per-preset, so it lives alongside the skin/cue push instead
   * of riding on `setPreset` — a preset switch must not reset it.
   */
  setAudioOptions(options: {
    volume: number;
    appearEnabled: boolean;
    disappearEnabled: boolean;
  }): void {
    const unchanged =
      options.volume === this.cueVolume &&
      options.appearEnabled === this.appearSoundEnabled &&
      options.disappearEnabled === this.disappearSoundEnabled;
    if (unchanged) return;

    this.cueVolume = options.volume;
    this.appearSoundEnabled = options.appearEnabled;
    this.disappearSoundEnabled = options.disappearEnabled;
    this.pushState();
  }

  sendState(
    state: Omit<
      StatePayload,
      'skinId' | 'cues' | 'presetName' | 'appearanceVideoUrl' | 'cueVolume' | 'appearSoundEnabled' | 'disappearSoundEnabled'
    >
  ): void {
    this.runtimeState = state;
    this.pushState();
  }

  private pushState(): void {
    this.browserWindow?.webContents.send(IPC.stateUpdate, {
      ...this.runtimeState,
      skinId: this.skinId,
      cues: this.cues,
      presetName: this.presetName,
      appearanceVideoUrl: this.appearanceVideoUrl,
      cueVolume: this.cueVolume,
      appearSoundEnabled: this.appearSoundEnabled,
      disappearSoundEnabled: this.disappearSoundEnabled
    } satisfies StatePayload);
  }

  /* --------------------------- OverlayPresenter --------------------- */

  show(payload: SpeechShowPayload): void {
    const win = this.browserWindow;
    if (!win) return;
    if (!this.ready) {
      this.pending = payload;
      return;
    }

    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }

    if (!win.isVisible()) {
      positionOverlay(win, this.offsets);
      // Never `show()` — that would take focus.
      win.showInactive();
      win.setAlwaysOnTop(true, 'screen-saver');
    }
    // Only now does the overlay need to know where the pointer is, and the
    // hook that tells it is charged to every mouse move on the machine.
    this.clickThrough?.setForwarding(true);
    win.webContents.send(IPC.speechShow, payload);
  }

  hide(): void {
    const win = this.browserWindow;
    if (!win) return;
    win.webContents.send(IPC.speechHide);
    this.scheduleWindowHide(EXIT_ANIMATION_MS);
  }

  interrupt(): void {
    const win = this.browserWindow;
    if (!win) return;
    win.webContents.send(IPC.speechInterrupt);
  }

  /* ------------------------------------------------------------------ */

  private scheduleWindowHide(delayMs: number): void {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null;
      const win = this.browserWindow;
      if (!win) return;
      win.hide();
      this.clickThrough?.reset();
    }, delayMs);
    this.hideTimer.unref?.();
  }

  private reposition(): void {
    const win = this.browserWindow;
    if (!win) return;
    positionOverlay(win, this.offsets);
  }

  static preloadPath(): string {
    return join(__dirname, '../preload/index.js');
  }
}
