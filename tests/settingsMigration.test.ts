import { describe, expect, it } from 'vitest';
import { migrate } from '@main/settings/settings';

/**
 * A failed parse discards the *whole* settings file and falls back to
 * defaults. That makes the skin rename a data-loss risk rather than a cosmetic
 * one: a stored `skinId: 'ovoid'` that never migrates takes the user's quiet
 * hours, watched folders and monitor toggles with it.
 */

describe('version 1 → 2, when the skins collapsed to a single eye', () => {
  const v1 = {
    version: 1,
    skinId: 'ovoid',
    startWithSystem: false,
    quietHours: { enabled: true, from: '01:00', to: '07:30' },
    watchedFolders: ['D:\\work'],
    monitors: { system: false }
  };

  it('rewrites the skin', () => {
    expect(migrate(v1).skinId).toBe('eye');
  });

  it('rewrites the one that no longer exists either', () => {
    expect(migrate({ ...v1, skinId: 'aperture' }).skinId).toBe('eye');
  });

  it('stamps the new version, so it runs once and not again', () => {
    const once = migrate(v1);
    expect(once.version).toBe(2);
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
    const v2 = { ...v1, version: 2, skinId: 'eye' };
    expect(migrate(v2)).toEqual(v2);
  });
});
