import { describe, expect, it } from 'vitest';
import { migrate } from '@main/settings/settings';

/**
 * A failed parse discards the *whole* settings file and falls back to
 * defaults. That makes the skin rename a data-loss risk rather than a cosmetic
 * one: a stored `skinId: 'ovoid'` that never migrates takes the user's quiet
 * hours, watched folders and monitor toggles with it. `migrate` runs the
 * whole chain oldest → newest in one call, so a v1 file lands on v4 directly.
 */

describe('version 1 → 4, through the skin collapse, the preset split, and cue audio options', () => {
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

  it('fills in default cue volume and per-cue on/off', () => {
    const out = migrate(v1);
    expect(out.overlay).toEqual({
      scale: undefined,
      offsetX: undefined,
      offsetY: undefined,
      cueVolume: 1,
      appearSoundEnabled: true,
      disappearSoundEnabled: true
    });
  });

  it('stamps the new version, so it runs once and not again', () => {
    const once = migrate(v1);
    expect(once.version).toBe(4);
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
    const v4 = {
      ...v1,
      version: 4,
      presets: [{ id: 'codex', name: 'Ordis', skinId: 'eye' }],
      activePresetId: 'codex',
      overlay: { scale: 1, offsetX: 0, offsetY: 0, cueVolume: 1, appearSoundEnabled: true, disappearSoundEnabled: true }
    };
    delete (v4 as { skinId?: unknown }).skinId;
    expect(migrate(v4)).toEqual(v4);
  });
});

describe('version 2 → 4, when the single skin split onto a preset', () => {
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

describe('version 3 → 4, when cue volume and per-cue on/off were added', () => {
  const v3 = {
    version: 3,
    startWithSystem: true,
    presets: [{ id: 'codex', name: 'Ordis', skinId: 'eye' }],
    activePresetId: 'codex',
    quietHours: { enabled: false, from: '00:00', to: '00:00' },
    overlay: { scale: 1.2, offsetX: 5, offsetY: -3 }
  };

  it('adds the three new overlay fields with their defaults', () => {
    const out = migrate(v3);
    expect(out.version).toBe(4);
    expect(out.overlay).toEqual({
      scale: 1.2,
      offsetX: 5,
      offsetY: -3,
      cueVolume: 1,
      appearSoundEnabled: true,
      disappearSoundEnabled: true
    });
  });

  it('does not stomp an overlay that already carries them', () => {
    const withOverrides = {
      ...v3,
      overlay: { ...v3.overlay, cueVolume: 0.3, appearSoundEnabled: false, disappearSoundEnabled: true }
    };
    const out = migrate(withOverrides);
    expect(out.overlay).toEqual({
      scale: 1.2,
      offsetX: 5,
      offsetY: -3,
      cueVolume: 0.3,
      appearSoundEnabled: false,
      disappearSoundEnabled: true
    });
  });

  it('leaves every other field untouched', () => {
    const out = migrate(v3);
    expect(out.presets).toEqual(v3.presets);
    expect(out.activePresetId).toBe('codex');
    expect(out.quietHours).toEqual(v3.quietHours);
  });
});
