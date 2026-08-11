/**
 * §4.4 — a persona is data, not code. Adding a character is adding one of
 * these objects; nothing in the components is character-specific.
 *
 * Only `ovoid` is implemented (§4.4: ship exactly one persona). The other
 * `ShellForm` values are declared so the extension points are visible, but
 * they have no parameter type and no generator yet — adding one means adding
 * a `ShellSpec` member, a generator module beside `forms/ovoid.ts`, and a
 * branch in `CharacterUnit`.
 */

export type OpticShape = 'teardrop' | 'round' | 'slit' | 'compound';
export type ShellForm = 'ovoid' | 'suspended' | 'monolith' | 'orb';

/** Geometry of an `ovoid` shell, in the unit's own viewBox coordinates. */
export interface OvoidParams {
  /** Vertical axis of the shell. */
  cx: number;
  /** Apex and base, in viewBox units. */
  top: number;
  bottom: number;
  /** Half-width immediately below the apex. */
  apexHalf: number;
  /** Widest half-width. */
  bellyHalf: number;
  /** Half-width where the shell meets its base. */
  baseHalf: number;
  /** 0..1 — where the belly sits between `top` and `bottom`. */
  bellyT: number;
  /**
   * The right half is scaled by this. §4.2 asks for deliberate asymmetry:
   * exactly 1 reads as a corporate mark, so never use it.
   */
  rightBias: number;
  /** Number of panel seams following the shell curvature. */
  panelCount: number;
}

/**
 * Discriminated on `form` rather than a bag of numbers, so a generator gets
 * real typechecking instead of `params['bellyHalf'] ?? 0`.
 */
export interface OvoidShell {
  form: 'ovoid';
  params: OvoidParams;
  material: Material;
}

/* Extension point: `| SuspendedShell | MonolithShell | OrbShell`. */
export type ShellSpec = OvoidShell;

/** Materials shade differently on purpose (§4.2). */
export type Material = 'metal' | 'ceramic';

export interface OpticSpec {
  count: 1 | 2;
  shape: OpticShape;
  arrangement: 'paired' | 'single' | 'stacked';
  /** Height of one optic in viewBox units; width follows the shape's ratio. */
  size: number;
  /** Centre-to-axis distance for `paired`. */
  spread: number;
  /** Vertical position along the shell, 0..1 from apex to base. */
  atT: number;
  /** Inward-down tilt in degrees, mirrored across the axis. */
  tiltDeg: number;
  /** §4.5 — one optic is fractionally brighter than its twin. */
  rightBias: number;
}

/**
 * Overrides the CSS custom properties of the same name on the unit's subtree,
 * so a persona restyles the whole component without touching its CSS.
 */
export interface PersonaPalette {
  shellHi: string;
  shellLo: string;
  /** Core shadow — the darkest value in the form shading. */
  shellCore: string;
  light: string;
  lightCore: string;
  lightDim: string;
  trim: string;
  trimLit: string;
  accent: string;
  rage: string;
  rageCore: string;
}

export interface PersonaMotion {
  idle: 'bob' | 'sway' | 'pendulum' | 'still';
  amplitudePx: number;
  periodMs: number;
}

export type Furniture = 'halo' | 'cables' | 'gimbal' | 'none';

export interface Persona {
  id: string;
  /** Shown in the name label, e.g. 'CODEX'. */
  nameLabel: string;
  /** Intrinsic size of the unit in viewBox units; also its CSS size. */
  unit: { width: number; height: number };
  shell: ShellSpec;
  optics: OpticSpec;
  palette: PersonaPalette;
  motion: PersonaMotion;
  furniture: Furniture[];
  /** Its own phrase bank. Unused in this task — main still loads one bank. */
  bankPath: string;
  /** Its own DSP chain, used later. */
  voicePreset: string;
}
