import type { CSSProperties } from 'react';
import type { SpeechMode } from '@shared/types';
import type { PersonaPalette } from '@renderer/personas/types';

/**
 * Shared palette plumbing — the one thing every skin may reuse.
 *
 * `rage` is resolved here, in data, rather than as a CSS override. A skin
 * writes its palette out as inline custom properties, and an inline custom
 * property beats any stylesheet rule on the same element, so a
 * `[data-mode='rage']` colour rule can never win. Swapping the hues before
 * they are written removes that trap for every skin at once.
 */
export function effectivePalette(palette: PersonaPalette, mode: SpeechMode | null): PersonaPalette {
  if (mode !== 'rage') return palette;
  return {
    ...palette,
    light: palette.rage,
    lightCore: palette.rageCore,
    lightDim: '#7A1F10'
  };
}

/** Palette → the `--p-*` properties every skin's CSS and SVG read. */
export function paletteVars(
  palette: PersonaPalette,
  canvas: { width: number; height: number }
): CSSProperties {
  return {
    '--p-shell-hi': palette.shellHi,
    '--p-shell-lo': palette.shellLo,
    '--p-shell-core': palette.shellCore,
    '--p-light': palette.light,
    '--p-light-core': palette.lightCore,
    '--p-light-dim': palette.lightDim,
    '--p-trim': palette.trim,
    '--p-trim-lit': palette.trimLit,
    '--p-accent': palette.accent,
    '--p-rage': palette.rage,
    '--p-rage-core': palette.rageCore,
    width: `${canvas.width}px`,
    height: `${canvas.height}px`
  } as CSSProperties;
}
