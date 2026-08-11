import type { SkinId } from '@shared/types';
import type { Skin } from './types';
import EyeSkin, { EYE_CANVAS, EYE_OPTIC_CENTRE } from './eye/EyeSkin';
import { EYE_MOTION, MODE_UNIFORMS } from './eye/eyeUniforms';

export * from './types';

/**
 * §3.0 — the registry. Adding a skin is one new folder and one entry here;
 * nothing else in the renderer changes, and nothing outside this file needs to
 * know how many skins exist. There is one at the moment, and the indirection
 * still earns its place: it is what keeps the persona, the settings panel and
 * the overlay from naming a component directly.
 */
const REGISTRY: Record<SkinId, Skin> = {
  eye: {
    id: 'eye',
    label: 'Eye',
    component: EyeSkin,
    canvas: EYE_CANVAS,
    opticCenter: EYE_OPTIC_CENTRE,
    /* The shader's blowout ramps whatever red it is given through orange and
       yellow on the way to white, and the persona's #FF5A3C is already part
       orange — with the warm red in, rage read as fire rather than as anger.
       Stated as data rather than hardcoded in the component, which is what
       `paletteOverrides` is for. */
    paletteOverrides: { rage: '#E80808', rageCore: '#FF5A5A' },
    motion: {
      idle: [
        { target: 'unit', kind: 'bob', amplitude: 4, periodMs: 5000 },
        /* Declared here as before, but the shader is what performs it —
           `EYE_MOTION` is the single source and this entry reads from it, so
           the two cannot drift apart. */
        {
          target: 'eye',
          kind: 'breathe',
          amplitude: EYE_MOTION.breatheAmplitude,
          periodMs: EYE_MOTION.breathePeriodMs
        }
      ],
      glitch: {
        /* No frame and no ring left to lose synchronisation with each other,
           so rage is carried by the eye alone: it compresses to a slit, tears,
           and the whole unit takes one chromatic split as it snaps. */
        frameDeg: 0,
        ringDeg: 0,
        eyeScaleY: MODE_UNIFORMS.rage.uOpenness,
        jitterPx: 2,
        fractureOpacity: 0,
        splitPx: 2,
        splitMs: 220
      }
    }
  }
};

export const DEFAULT_SKIN_ID: SkinId = 'eye';

/** Falls back rather than throwing — an unknown id must never blank the
 *  overlay, and settings can carry a value from a future build. */
export function getSkin(id: SkinId | undefined): Skin {
  return REGISTRY[id ?? DEFAULT_SKIN_ID] ?? REGISTRY[DEFAULT_SKIN_ID];
}

export function allSkins(): Skin[] {
  return Object.values(REGISTRY);
}
