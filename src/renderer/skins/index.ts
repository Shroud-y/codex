import type { SkinId } from '@shared/types';
import type { Skin } from './types';
import OvoidSkin, { OVOID_CANVAS, OVOID_OPTIC_CENTRE } from './ovoid/OvoidSkin';
import ApertureSkin, { APERTURE_CANVAS, APERTURE_OPTIC_CENTRE } from './aperture/ApertureSkin';

export * from './types';

/**
 * §3.0 — the registry. Adding a skin is one new folder and one entry here;
 * nothing else in the renderer changes, and nothing outside this file needs to
 * know how many skins exist.
 */
const REGISTRY: Record<SkinId, Skin> = {
  ovoid: {
    id: 'ovoid',
    label: 'Ovoid',
    component: OvoidSkin,
    canvas: OVOID_CANVAS,
    opticCenter: OVOID_OPTIC_CENTRE,
    motion: {
      idle: [
        { target: 'unit', kind: 'bob', amplitude: 4, periodMs: 5000 },
        { target: 'optics', kind: 'breathe', amplitude: 0.18, periodMs: 2400 },
        { target: 'halo', kind: 'spin', amplitude: 360, periodMs: 90_000 }
      ],
      glitch: {
        frameDeg: 0,
        ringDeg: 0,
        eyeScaleY: 1,
        jitterPx: 2,
        fractureOpacity: 0,
        splitPx: 2,
        splitMs: 220
      }
    }
  },

  aperture: {
    id: 'aperture',
    label: 'Aperture',
    component: ApertureSkin,
    canvas: APERTURE_CANVAS,
    opticCenter: APERTURE_OPTIC_CENTRE,
    /* The persona's gold is tuned for a painted shell. On bare machined ribs
       it reads decorative against a cool desktop, so this skin pulls the
       saturation down and adds grey. Stated as data rather than hardcoded in
       the component, which is exactly what `paletteOverrides` is for. */
    paletteOverrides: { trim: '#B49A4E', trimLit: '#D8C486' },
    motion: {
      idle: [
        { target: 'unit', kind: 'bob', amplitude: 4, periodMs: 5000 },
        { target: 'frame', kind: 'oscillate', amplitude: 3, periodMs: 12_000 },
        { target: 'ring', kind: 'spin', amplitude: -360, periodMs: 40_000 },
        { target: 'eye', kind: 'breathe', amplitude: 0.18, periodMs: 2400 }
      ],
      glitch: {
        frameDeg: 8,
        ringDeg: -25,
        eyeScaleY: 0.15,
        jitterPx: 2,
        fractureOpacity: 0.8,
        splitPx: 2,
        splitMs: 220
      }
    }
  }
};

export const DEFAULT_SKIN_ID: SkinId = 'ovoid';

/** Falls back rather than throwing — an unknown id must never blank the
 *  overlay, and settings can carry a value from a future build. */
export function getSkin(id: SkinId | undefined): Skin {
  return REGISTRY[id ?? DEFAULT_SKIN_ID] ?? REGISTRY[DEFAULT_SKIN_ID];
}

export function allSkins(): Skin[] {
  return Object.values(REGISTRY);
}
