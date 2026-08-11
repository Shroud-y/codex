import type { SpeechMode } from '@shared/types';
import { CANVAS, CENTRE, EYE } from './geometry';

/**
 * Everything about the eye that is arithmetic rather than GL, kept separate so
 * it can be tested without a canvas.
 */

/** One frame's worth of shader inputs. Names match the uniforms exactly. */
export interface EyeUniforms {
  uWarpAmp: number;
  uOctaves: number;
  uNoiseScale: number;
  uThickness: number;
  uThickVar: number;
  uCoreIntensity: number;
  uCoreRadius: number;
  uDispersion: number;
  uInterior: number;
  uOpenness: number;
  uRadiusA: number;
  uStrengthA: number;
  uRadiusB: number;
  uStrengthB: number;
  uExposure: number;
}

/**
 * The prototype was tuned against a lens of half-width 0.34 in units of half
 * the viewport height. This one is 0.31, so the values that carry a length
 * come with it — otherwise the noise reads at the wrong scale and the membrane
 * comes out too thick.
 *
 * Written as `PROTOTYPE_VALUE * SCALE` rather than as pre-multiplied constants,
 * so the numbers stay traceable to the look that was signed off.
 */
const PROTOTYPE_HALF_W = 0.34;

/** Half-extents at full openness, in units of half the canvas height. */
export const EYE_SHAPE: readonly [number, number] = [
  EYE.width / 2 / CANVAS.height,
  EYE.height / 2 / CANVAS.height
];

export const SCALE = EYE_SHAPE[0] / PROTOTYPE_HALF_W;

/**
 * Optic centre as an offset from the canvas centre. Y is negated because
 * `gl_FragCoord` counts up from the bottom and the skin's geometry counts down
 * from the top.
 */
export const EYE_CENTRE: readonly [number, number] = [
  (CENTRE.x - CANVAS.width / 2) / CANVAS.height,
  -(CENTRE.y - CANVAS.height / 2) / CANVAS.height
];

/*
 * Close to the prototype, because the eye is now close to the prototype's
 * proportions. The bloom strengths are the exception and stay below it: the
 * prototype had a whole 1080p screen to bloom into, and this canvas is 150 x
 * 175, where a glow that reaches the edge is clamped by the blur and leaves a
 * visible rectangle of haze.
 */
const BASE: EyeUniforms = {
  uWarpAmp: 0.034 * SCALE,
  uOctaves: 4,
  uNoiseScale: 6.4 / SCALE,
  uThickness: 0.006 * SCALE,
  uThickVar: 0.62,
  uCoreIntensity: 1.45,
  uCoreRadius: 0.2,
  uDispersion: 0.028,
  uInterior: 0.85,
  uOpenness: 1,
  uRadiusA: 1.15,
  uStrengthA: 0.5,
  uRadiusB: 1.35,
  uStrengthB: 0.42,
  uExposure: 1
};

/*
 * Rage is red, not fire. Three things were making it read as flame and all
 * three are held down here: dispersion, which paints a literal spectrum along
 * the contour; a wide core, whose blowout ramps red through orange and yellow
 * on its way to white; and a warm core hue. The damage comes from warp
 * amplitude and thickness variation instead, which is where it belongs.
 *
 * The colours themselves are not set here — they come from the palette, and
 * the skin states its colder red as `paletteOverrides` in the registry.
 */
const RAGE: EyeUniforms = {
  ...BASE,
  uOpenness: 0.14,
  uWarpAmp: 0.072 * SCALE,
  uOctaves: 5.4,
  uNoiseScale: 9.8 / SCALE,
  uThickness: 0.0085 * SCALE,
  uThickVar: 0.85,
  uCoreIntensity: 1.3,
  uCoreRadius: 0.07,
  uDispersion: 0.028
};

/** §3.1 — whisper dims rather than changes shape. */
const WHISPER: EyeUniforms = {
  ...BASE,
  uExposure: 0.72,
  uCoreIntensity: 1.2
};

export const MODE_UNIFORMS: Record<SpeechMode, EyeUniforms> = {
  normal: BASE,
  rage: RAGE,
  whisper: WHISPER
};

/**
 * Idle and speaking motion for the optic. Mirrors what the CSS did for the SVG
 * eye, and is re-exported into the skin registry so the two cannot drift.
 */
export const EYE_MOTION = {
  breatheAmplitude: 0.18,
  breathePeriodMs: 2400,
  /** Whisper breathes far slower — matched to the old animation-duration. */
  whisperPeriodMs: 6000,
  speakAmplitude: 0.08,
  speakPeriodMs: 900
} as const;

export interface OpennessInput {
  mode: SpeechMode;
  speaking: boolean;
  reducedMotion: boolean;
  elapsedMs: number;
}

/**
 * How far open the aperture is this frame.
 *
 * Rage holds its compressed slit rather than breathing — the mechanism has
 * lost synchronisation, and something still breathing calmly reads as fine.
 * With reduced motion the aperture sits still at its resting value.
 */
export function opennessAt({ mode, speaking, reducedMotion, elapsedMs }: OpennessInput): number {
  const base = MODE_UNIFORMS[mode].uOpenness;
  if (mode === 'rage' || reducedMotion) return base;

  const { amplitude, periodMs } = speaking
    ? { amplitude: EYE_MOTION.speakAmplitude, periodMs: EYE_MOTION.speakPeriodMs }
    : {
        amplitude: EYE_MOTION.breatheAmplitude,
        periodMs: mode === 'whisper' ? EYE_MOTION.whisperPeriodMs : EYE_MOTION.breathePeriodMs
      };

  // Cosine rather than sine so the cycle starts wide open, the way the CSS
  // keyframes did — a fade-in that begins mid-blink is noticeable.
  const phase = (elapsedMs % periodMs) / periodMs;
  const closed = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
  return base * (1 - amplitude * closed);
}

/** `#rrggbb` → linear-ish 0..1 triple. Malformed input yields black. */
export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * How many half-resolution bloom levels are worth allocating.
 *
 * The prototype ran four at 1080p. Here the limit is not blockiness but reach:
 * each level doubles how far the glow spreads, and a glow wider than the
 * canvas gets cut off in a straight line no matter how it is faded. Two levels
 * put the widest bloom at roughly the margin the eye leaves around itself.
 */
export function bloomLevels(width: number, height: number, minSize = 48): number {
  let levels = 0;
  let w = width;
  let h = height;
  while (levels < 3 && Math.min(w >> 1, h >> 1) >= minSize) {
    w >>= 1;
    h >>= 1;
    levels++;
  }
  return Math.max(levels, 1);
}
