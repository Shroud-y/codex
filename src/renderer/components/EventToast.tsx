import type { ToastGlyph, ToastPayload } from '@shared/types';
import styles from './EventToast.module.css';

export interface EventToastProps {
  toast: ToastPayload;
  /** False starts the exit fade; the parent unmounts once it has played. */
  visible: boolean;
}

/**
 * §6 — the only part of the overlay with visible chrome, and the only place a
 * fill and a border are allowed. Everything else floats bare on the desktop.
 */
export default function EventToast({ toast, visible }: EventToastProps): JSX.Element {
  return (
    <div className={styles.toast} data-state={visible ? 'in' : 'out'} aria-hidden="true">
      {/* The chamfered 1 px frame, drawn as a ring so the translucent face
          keeps showing the desktop through it. */}
      <div className={styles.border} />
      <div className={styles.face}>
        <div className={styles.glyphCell}>
          <Glyph kind={toast.glyph} />
        </div>
        <div className={styles.rule} />
        <div className={styles.text}>{toast.text}</div>
      </div>
    </div>
  );
}

/** Simple geometric marks, constructed from primitives (§1). */
function Glyph({ kind }: { kind: ToastGlyph }): JSX.Element {
  const common = {
    viewBox: '0 0 24 24',
    className: styles.glyph,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const
  };

  switch (kind) {
    case 'download':
      return (
        <svg {...common}>
          <path d="M12 3v11" />
          <path d="M7 10l5 5 5-5" />
          <path d="M4 20h16" />
        </svg>
      );
    case 'disk':
      return (
        <svg {...common}>
          <ellipse cx="12" cy="6.5" rx="7.5" ry="3" />
          <path d="M4.5 6.5v11c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-11" />
          <path d="M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3" />
        </svg>
      );
    case 'clock':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7v5.4l3.4 2" />
        </svg>
      );
    case 'alert':
      return (
        <svg {...common}>
          <path d="M12 3.5 21 19H3z" />
          <path d="M12 9.5v4.2" />
          <path d="M12 16.4h.01" />
        </svg>
      );
    case 'build':
    default:
      return (
        <svg {...common}>
          <path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5z" />
          <path d="M4 8.5 12 13l8-4.5" />
          <path d="M12 13v7" />
        </svg>
      );
  }
}
