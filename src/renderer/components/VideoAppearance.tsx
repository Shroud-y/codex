import styles from './VideoAppearance.module.css';

export interface VideoAppearanceProps {
  src: string;
  canvas: { width: number; height: number };
}

/**
 * A preset's custom appearance, replacing the shader skin entirely. `<video>`
 * rather than an animated `<img>` GIF: Chromium hardware-decodes video but
 * software-decodes GIF frame by frame, and in an always-on-top transparent
 * overlay window that CPU decode step visibly stutters even for a small,
 * well-formed file (measured 2026-08-21).
 *
 * The wrapping `.unit` box (see `CharacterUnit`) already carries the bob
 * motion and the `data-speaking`/`data-mode` state, so this needs no bespoke
 * animation — it just fills the same canvas footprint every skin uses, and
 * rides the same enter/exit transition `Companion` already drives.
 */
export default function VideoAppearance({ src, canvas }: VideoAppearanceProps): JSX.Element {
  return (
    <video
      className={styles.video}
      src={src}
      width={canvas.width}
      height={canvas.height}
      autoPlay
      loop
      muted
      playsInline
      disablePictureInPicture
      preload="auto"
    />
  );
}
