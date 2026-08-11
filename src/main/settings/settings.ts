import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { z } from 'zod';
import type { Settings } from '@shared/types';
import { createLogger } from '../log/logger';

const log = createLogger('settings');

const clockSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const settingsSchema = z.object({
  version: z.literal(2),
  startWithSystem: z.boolean(),
  skinId: z.enum(['eye']),
  frequencyProfile: z.enum(['chatty', 'balanced', 'reserved', 'rare']),
  quietHours: z.object({ enabled: z.boolean(), from: clockSchema, to: clockSchema }),
  suppressOnFullscreen: z.boolean(),
  suppressOnMicrophoneUse: z.boolean(),
  watchedProcesses: z.array(z.string()),
  watchedFolders: z.array(z.string()),
  monitors: z.record(z.string(), z.boolean()),
  overlay: z.object({
    scale: z.number().min(0.5).max(2),
    offsetX: z.number(),
    offsetY: z.number()
  })
});

export const MONITOR_IDS = ['system', 'process', 'idle', 'schedule', 'session', 'file'] as const;

export const DEFAULT_WATCHED_PROCESSES = [
  'Code.exe',
  'devenv.exe',
  'idea64.exe',
  'pycharm64.exe',
  'WebStorm64.exe',
  'rider64.exe',
  'chrome.exe',
  'firefox.exe',
  'msedge.exe',
  'Discord.exe',
  'Steam.exe',
  'EpicGamesLauncher.exe',
  'Battle.net.exe',
  'obs64.exe',
  'blender.exe',
  'photoshop.exe'
];

export function defaultSettings(downloadsDir: string): Settings {
  return {
    version: 2,
    startWithSystem: true,
    skinId: 'eye',
    frequencyProfile: 'balanced',
    quietHours: { enabled: true, from: '23:00', to: '08:00' },
    suppressOnFullscreen: true,
    suppressOnMicrophoneUse: true,
    watchedProcesses: [...DEFAULT_WATCHED_PROCESSES],
    watchedFolders: [downloadsDir],
    monitors: Object.fromEntries(MONITOR_IDS.map((id) => [id, true])),
    overlay: { scale: 1, offsetX: 0, offsetY: 0 }
  };
}

/**
 * Migrations run oldest → newest.
 *
 * Version 2 drops the `ovoid` and `aperture` skins for a single `eye`. Without
 * this the stored `skinId` would fail validation, and a failed parse discards
 * the *whole* file — an appearance change would silently take the user's quiet
 * hours, watch lists and folders with it.
 */
type RawSettings = Record<string, unknown>;
const MIGRATIONS: Record<number, (input: RawSettings) => RawSettings> = {
  1: (input) => ({ ...input, version: 2, skinId: 'eye' })
};

export function migrate(raw: RawSettings): RawSettings {
  let current = raw;
  let version = typeof current.version === 'number' ? current.version : 1;
  while (MIGRATIONS[version]) {
    current = MIGRATIONS[version]!(current);
    version = typeof current.version === 'number' ? current.version : version + 1;
  }
  return current;
}

export class SettingsStore {
  private value: Settings;
  private readonly listeners = new Set<(settings: Settings) => void>();

  constructor(
    private readonly filePath: string,
    private readonly fallback: Settings
  ) {
    this.value = this.read();
  }

  get current(): Settings {
    return this.value;
  }

  onChange(listener: (settings: Settings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  update(patch: Partial<Settings>): Settings {
    const merged = { ...this.value, ...patch, version: 2 as const };
    const parsed = settingsSchema.safeParse(merged);
    if (!parsed.success) {
      log.warn(`rejected settings update: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
      return this.value;
    }
    this.value = parsed.data as Settings;
    this.write();
    for (const listener of this.listeners) listener(this.value);
    return this.value;
  }

  private read(): Settings {
    if (!existsSync(this.filePath)) {
      this.value = this.fallback;
      this.write();
      return this.fallback;
    }
    try {
      const raw = JSON.parse(readFileSync(this.filePath, 'utf8')) as RawSettings;
      const migrated = migrate(raw);
      const parsed = settingsSchema.safeParse({ ...this.fallback, ...migrated });
      if (!parsed.success) {
        log.warn('settings file invalid, falling back to defaults for the bad fields');
        return this.fallback;
      }
      return parsed.data as Settings;
    } catch (err) {
      log.warn(`cannot read settings (${(err as Error).message}) — using defaults`);
      return this.fallback;
    }
  }

  private write(): void {
    try {
      const tmp = `${this.filePath}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.value, null, 2), 'utf8');
      renameSync(tmp, this.filePath);
    } catch (err) {
      log.error(`cannot write settings: ${(err as Error).message}`);
    }
  }
}
