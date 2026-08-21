import styles from './GifAppearance.module.css';

export interface GifAppearanceProps {
  src: string;
  canvas: { width: number; height: number };
}

/**
 * A preset's custom appearance, replacing the shader skin entirely. The
 * wrapping `.unit` box (see `CharacterUnit`) already carries the bob motion
 * and the `data-speaking`/`data-mode` state, so the GIF itself needs no
 * bespoke animation — it just fills the same canvas footprint every skin
 * uses, and rides the same enter/exit transition `Companion` already drives.
 */
export default function GifAppearance({ src, canvas }: GifAppearanceProps): JSX.Element {
  return (
    <img
      className={styles.gif}
      src={src}
      width={canvas.width}
      height={canvas.height}
      alt=""
      draggable={false}
    />
  );
}
