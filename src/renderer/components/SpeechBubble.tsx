import type { PhraseSegment } from '@shared/types';
import styles from './SpeechBubble.module.css';

export interface SpeechBubbleProps {
  segments: PhraseSegment[];
  activeIndex: number;
  revealed: number;
  reducedMotion: boolean;
  onDismiss: () => void;
}

const MODE_CLASS = {
  normal: styles.normal,
  rage: styles.rage,
  whisper: styles.whisper
} as const;

export default function SpeechBubble({
  segments,
  activeIndex,
  revealed,
  reducedMotion,
  onDismiss
}: SpeechBubbleProps): JSX.Element {
  const typing = activeIndex < segments.length && revealed < (segments[activeIndex]?.text.length ?? 0);

  return (
    <div
      className={styles.bubble}
      // The only interactive affordance in Phase 1 (§10.2).
      data-interactive="true"
      role="button"
      tabIndex={-1}
      onClick={onDismiss}
      title="Dismiss"
    >
      {segments.map((segment, index) => {
        if (index > activeIndex) return null;
        const text = index === activeIndex ? segment.text.slice(0, revealed) : segment.text;
        if (text.length === 0) return null;
        const entering = index === activeIndex && !reducedMotion;
        return (
          <span
            key={index}
            className={`${styles.segment} ${MODE_CLASS[segment.mode]} ${
              segment.mode === 'rage' && entering ? styles.entering : ''
            }`}
          >
            {index > 0 ? ' ' : ''}
            {text}
          </span>
        );
      })}
      {typing && !reducedMotion ? <span className={styles.caret}>▍</span> : null}
      <div className={styles.hint}>click to dismiss</div>
    </div>
  );
}
