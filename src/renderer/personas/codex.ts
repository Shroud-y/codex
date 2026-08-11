import type { Persona } from './types';

/**
 * §4.5 — the only persona implemented. A vertical ovoid, wider at the base,
 * metal, two teardrop optics angled inward-down, gold trim low on the body and
 * one copper accent block breaking the symmetry.
 */
export const codex: Persona = {
  id: 'codex',
  nameLabel: 'CODEX',
  unit: { width: 150, height: 175 },

  shell: {
    form: 'ovoid',
    material: 'metal',
    params: {
      cx: 75,
      top: 34,
      bottom: 166,
      apexHalf: 18,
      bellyHalf: 55,
      baseHalf: 40,
      bellyT: 0.6,
      // Never 1 (§4.2). The right flank carries ~3% more mass.
      rightBias: 1.03,
      panelCount: 3
    }
  },

  optics: {
    count: 2,
    shape: 'teardrop',
    arrangement: 'paired',
    size: 40,
    spread: 16,
    atT: 0.44,
    tiltDeg: 28,
    // §4.5 — the right optic runs fractionally hot.
    rightBias: 1.06
  },

  palette: {
    shellHi: '#3A4148',
    shellLo: '#232A26',
    shellCore: '#161B18',
    light: '#3FC8DC',
    lightCore: '#B8F4FF',
    lightDim: '#1B6C7A',
    trim: '#C9A227',
    trimLit: '#E8CC6A',
    accent: '#A8593A',
    rage: '#FF5A3C',
    rageCore: '#FFB199'
  },

  motion: { idle: 'bob', amplitudePx: 4, periodMs: 5000 },
  furniture: ['halo'],

  /* Not yet consumed — main still loads a single bank and a single voice. */
  bankPath: 'resources/phrases/bank.json',
  voicePreset: 'codex-default'
};
