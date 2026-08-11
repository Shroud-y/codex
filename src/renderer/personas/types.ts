import type { SkinId } from '@shared/types';

/**
 * §3.0 — a persona is *who is speaking*: the name on the label, the colours it
 * is lit in, the bank it draws lines from and the voice it uses. What it looks
 * like is a skin (`src/renderer/skins/`), and the two are independent: any
 * persona can wear any skin, and a skin renders whatever palette it is handed.
 */

/**
 * Overrides the CSS custom properties of the same name on the unit's subtree,
 * so a persona restyles every skin without any skin knowing about it.
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

export interface Persona {
  id: string;
  /** Shown in the name label, e.g. 'CODEX'. */
  nameLabel: string;
  palette: PersonaPalette;
  /** Used unless settings name a different one. */
  defaultSkin: SkinId;
  /** Its own phrase bank. Unused in this task — main still loads one bank. */
  bankPath: string;
  /** Its own DSP chain, used later. */
  voicePreset: string;
}
