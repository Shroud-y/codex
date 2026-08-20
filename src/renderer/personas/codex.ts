import type { Persona } from './types';

/**
 * The only persona. Its geometry lives in the skins — this is just who is
 * talking and what colour the light is.
 */
export const codex: Persona = {
  id: 'codex',
  nameLabel: 'ORDIS',

  palette: {
    shellHi: '#3A4148',
    shellLo: '#232A26',
    shellCore: '#12171A',
    light: '#3FC8DC',
    lightCore: '#B8F4FF',
    lightDim: '#1B6C7A',
    trim: '#C9A227',
    trimLit: '#E8CC6A',
    accent: '#A8593A',
    rage: '#FF5A3C',
    rageCore: '#FFB199'
  },

  defaultSkin: 'eye',

  /* Not yet consumed — main still loads a single bank and a single voice. */
  bankPath: 'resources/phrases/bank.json',
  voicePreset: 'codex-default'
};
