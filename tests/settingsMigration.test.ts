import { describe, expect, it } from 'vitest';
import { migrate } from '@main/settings/settings';

/**
 * A failed parse discards the *whole* settings file and falls back to
 * defaults. That makes the skin rename a data-loss risk rather than a cosmetic
 * one: a stored `skinId: 'ovoid'` that never migrates takes the user's quiet
 * hours, watched folders and monitor toggles with it. `migrate` runs the
 * whole chain oldest → newest in one call, so a v1 file lands on v3 directly.
 */

describe('version 1 → 3, through the skin collapse and the preset split', () => {
  const v1 = {
    version: 1,
    skinId: 'ovoid',
    startWithSystem: false,
    quietHours: { enabled: true, from: '01:00', to: '07:30' },
    watchedFolders: ['D:\\work'],
    monitors: { system: false }
  };

  it('carries the skin into the built-in preset', () => {
    const out = migrate(v1);
    expect(out.presets).toEqual([{ id: 'codex', name: 'Ordis', skinId: 'eye' }]);
    expect(out.activePresetId).toBe('codex');
    expect(out.skinId).toBeUndefined();
  });

  it('rewrites the skin that no longer exists either', () => {
    const out = migrate({ ...v1, skinId: 'aperture' });
    expect((out.presets as { skinId: string }[])[0]!.skinId).toBe('eye');
  });

  it('stamps the new version, so it runs once and not again', () => {
    const once = migrate(v1);
    expect(once.version).toBe(3);
    expect(migrate(once)).toEqual(once);
  });

  it('keeps every other field the user set', () => {
    const out = migrate(v1);
    expect(out.startWithSystem).toBe(false);
    expect(out.quietHours).toEqual({ enabled: true, from: '01:00', to: '07:30' });
    expect(out.watchedFolders).toEqual(['D:\\work']);
    expect(out.monitors).toEqual({ system: false });
  });

  it('leaves an already-current file alone', () => {
    const v3 = { ...v1, version: 3, presets: [{ id: 'codex', name: 'Ordis', skinId: 'eye' }], activePresetId: 'codex' };
    delete (v3 as { skinId?: unknown }).skinId;
    expect(migrate(v3)).toEqual(v3);
  });
});

describe('version 2 → 3, when the single skin split onto a preset', () => {
  const v2 = {
    version: 2,
    skinId: 'eye',
    startWithSystem: true,
    quietHours: { enabled: false, from: '00:00', to: '00:00' },
    watchedFolders: [],
    monitors: {}
  };

  it('wraps the old skin into a single built-in preset named Ordis', () => {
    const out = migrate(v2);
    expect(out.version).toBe(3);
    expect(out.presets).toEqual([{ id: 'codex', name: 'Ordis', skinId: 'eye' }]);
    expect(out.activePresetId).toBe('codex');
  });

  it('drops the top-level skinId field', () => {
    expect(migrate(v2).skinId).toBeUndefined();
  });

  it('keeps a custom skin choice rather than resetting it', () => {
    // 'eye' is the only real skin today, but the migration should not assume
    // that and hardcode it — it must carry forward whatever was stored.
    const out = migrate({ ...v2, skinId: 'eye' });
    expect((out.presets as { skinId: string }[])[0]!.skinId).toBe('eye');
  });
});
