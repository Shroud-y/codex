import type { PhraseSegment } from '@shared/types';
import Portrait from './Portrait';
import SpeechBubble from './SpeechBubble';
import styles from './Companion.module.css';

export interface CompanionProps {
  segments: PhraseSegment[];
  activeIndex: number;
  revealed: number;
  visible: boolean;
  reducedMotion: boolean;
  onDismiss: () => void;
}

export default function Companion({
  segments,
  activeIndex,
  revealed,
  visible,
  reducedMotion,
  onDismiss
}: CompanionProps): JSX.Element | null {
  const mode = visible ? (segments[activeIndex]?.mode ?? null) : null;

  // Nothing on screen and nothing to animate out: render nothing at all, so a
  // hidden overlay costs no compositing work.
  if (!visible && segments.length === 0) return null;

  return (
    <div className={`${styles.root} ${visible ? styles.visible : styles.hidden}`}>
      <div className={styles.bubbleSlot}>
        {segments.length > 0 ? (
          <SpeechBubble
            segments={segments}
            activeIndex={activeIndex}
            revealed={revealed}
            reducedMotion={reducedMotion}
            onDismiss={onDismiss}
          />
        ) : null}
      </div>
      <div className={styles.portraitSlot}>
        <Portrait mode={mode} />
      </div>
    </div>
  );
}
