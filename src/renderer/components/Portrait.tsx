import type { SpeechMode } from '@shared/types';
import styles from './Portrait.module.css';

export interface PortraitProps {
  /** Drives the eye motif; `null` means idle. */
  mode: SpeechMode | null;
}

/**
 * §13.2 — placeholder art. Everything visual lives behind this props
 * interface so real art or a sprite sheet replaces it cleanly.
 */
export default function Portrait({ mode }: PortraitProps): JSX.Element {
  const modeClass =
    mode === 'rage' ? styles.rage : mode === 'whisper' ? styles.whisper : mode ? '' : styles.idle;

  return (
    <div className={`${styles.portrait} ${modeClass}`} aria-hidden="true">
      <svg className={styles.eye} viewBox="0 0 44 44" fill="none">
        <rect x="1" y="1" width="42" height="42" rx="10" stroke="rgba(140,225,255,0.35)" />
        <g className={styles.iris}>
          <polygon
            points="22,8 34,22 22,36 10,22"
            fill={mode === 'rage' ? 'rgba(255,90,90,0.9)' : 'rgba(120,220,255,0.85)'}
          />
          <circle cx="22" cy="22" r="4" fill="#050a0e" />
        </g>
      </svg>
    </div>
  );
}
