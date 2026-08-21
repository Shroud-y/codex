import { Menu, Tray, app, nativeImage } from 'electron';
import { join } from 'node:path';
import type { FrequencyProfile } from '@shared/types';
import { createLogger } from '../log/logger';
import type { RuntimeState, SnoozeChoice } from '../core/runtimeState';

const log = createLogger('tray');

export interface TrayActions {
  saySomethingNow(): void;
  setSnooze(choice: SnoozeChoice): void;
  setFrequency(profile: FrequencyProfile): void;
  openSettings(): void;
  openDebug(): void;
  quit(): void;
}

export interface TrayDeps {
  iconPath: string;
  state: RuntimeState;
  getFrequency: () => FrequencyProfile;
  isDev: boolean;
  actions: TrayActions;
}

const FREQUENCIES: { id: FrequencyProfile; label: string }[] = [
  { id: 'chatty', label: 'Chatty' },
  { id: 'balanced', label: 'Balanced' },
  { id: 'reserved', label: 'Reserved' },
  { id: 'rare', label: 'Rare' }
];

export class CodexTray {
  private tray: Tray | null = null;

  constructor(private readonly deps: TrayDeps) {}

  create(): void {
    const image = nativeImage.createFromPath(this.deps.iconPath);
    this.tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
    this.tray.setToolTip('SHARD');
    // Left click toggles mute (§11).
    this.tray.on('click', () => {
      this.deps.state.toggleMute();
      this.refresh();
    });
    this.refresh();
    log.info('tray created');
  }

  destroy(): void {
    this.tray?.destroy();
    this.tray = null;
  }

  refresh(): void {
    if (!this.tray) return;
    this.tray.setContextMenu(this.buildMenu());
    this.tray.setToolTip(`SHARD — ${this.statusLabel()}`);
  }

  private statusLabel(): string {
    const now = Date.now();
    if (this.deps.state.isMuted) return 'Muted';
    if (this.deps.state.snoozedForRestart) return 'Snoozed until restart';
    const until = this.deps.state.snoozeUntil(now);
    if (until !== null && Number.isFinite(until)) {
      const time = new Date(until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `Snoozed until ${time}`;
    }
    return 'Active';
  }

  private buildMenu(): Menu {
    const { actions, state } = this.deps;
    const muted = state.isMuted;

    return Menu.buildFromTemplate([
      { label: `SHARD — ${this.statusLabel()}`, enabled: false },
      { type: 'separator' },
      {
        label: muted ? 'Say something now (muted)' : 'Say something now',
        enabled: !muted,
        click: () => actions.saySomethingNow()
      },
      {
        label: 'Mute',
        type: 'checkbox',
        checked: muted,
        click: () => {
          state.toggleMute();
          this.refresh();
        }
      },
      {
        label: 'Snooze',
        submenu: [
          { label: '30 minutes', click: () => this.snooze('30m') },
          { label: '2 hours', click: () => this.snooze('2h') },
          { label: 'Until restart', click: () => this.snooze('restart') },
          { type: 'separator' },
          { label: 'Cancel snooze', click: () => this.snooze('off') }
        ]
      },
      {
        label: 'Frequency',
        submenu: FREQUENCIES.map((entry) => ({
          label: entry.label,
          type: 'radio' as const,
          checked: this.deps.getFrequency() === entry.id,
          click: () => {
            actions.setFrequency(entry.id);
            this.refresh();
          }
        }))
      },
      { type: 'separator' },
      { label: 'Settings…', click: () => actions.openSettings() },
      ...(this.deps.isDev
        ? [{ label: 'Open debug panel', click: () => actions.openDebug() }]
        : []),
      { type: 'separator' },
      { label: 'Quit', click: () => actions.quit() }
    ]);
  }

  private snooze(choice: SnoozeChoice): void {
    this.deps.actions.setSnooze(choice);
    this.refresh();
  }

  static defaultIconPath(iconsDir: string): string {
    return join(iconsDir, 'tray.ico');
  }
}

/** Keeps the tray label honest while a snooze counts down. */
export function startTrayRefreshLoop(tray: CodexTray, intervalMs = 60_000): () => void {
  const timer = setInterval(() => tray.refresh(), intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

export function isDevBuild(): boolean {
  return !app.isPackaged;
}
