import type { CSSProperties } from 'react';
import type { SkinId, SpeechMode } from '@shared/types';
import type { Persona } from '@renderer/personas';
import { getSkin } from '@renderer/skins';
import styles from './CharacterUnit.module.css';

export interface CharacterUnitProps {
  persona: Persona;
  /** Overrides the persona's default. Comes from settings at runtime. */
  skinId?: SkinId;
  /** `null` when idle — nothing is being said. */
  mode: SpeechMode | null;
  speaking: boolean;
  reducedMotion: boolean;
  /**
   * §4.1 — the governing test. Hides every emissive, bloom, halo and spill
   * layer so the form can be judged on its shading alone. Driven by the design
   * harness; the overlay never sets it.
   */
  unlit?: boolean;
}

/**
 * Chooses a skin and gives it the one thing every skin shares: a wrapper that
 * carries the state as data attributes and does the bob. Everything else —
 * geometry, layer stack, motion, glitch — belongs to the skin.
 */
export default function CharacterUnit({
  persona,
  skinId,
  mode,
  speaking,
  reducedMotion,
  unlit = false
}: CharacterUnitProps): JSX.Element {
  const skin = getSkin(skinId ?? persona.defaultSkin);
  const Skin = skin.component;

  const bob = skin.motion.idle.find((spec) => spec.target === 'unit' && spec.kind === 'bob');
  const palette = skin.paletteOverrides
    ? { ...persona.palette, ...skin.paletteOverrides }
    : persona.palette;

  const style = {
    width: `${skin.canvas.width}px`,
    height: `${skin.canvas.height}px`,
    '--bob-px': `${bob?.amplitude ?? 0}px`,
    '--bob-ms': `${bob?.periodMs ?? 5000}ms`
  } as CSSProperties;

  return (
    <div
      className={styles.unit}
      style={style}
      data-skin={skin.id}
      data-mode={mode ?? 'normal'}
      data-speaking={speaking ? 'true' : 'false'}
      data-unlit={unlit ? 'true' : 'false'}
      data-reduced={reducedMotion ? 'true' : 'false'}
      data-bob={bob ? 'true' : 'false'}
      aria-hidden="true"
    >
      <Skin palette={palette} mode={mode ?? 'normal'} speaking={speaking} reducedMotion={reducedMotion} unlit={unlit} />
    </div>
  );
}
