import { useEffect, useState } from 'react';
import type { PhraseSegment } from '@shared/types';
import styles from './Dialogue.module.css';

export interface DialogueProps {
  /** The segment currently on screen. Segments never accumulate (§5). */
  segment: PhraseSegment | null;
  /** Characters of `segment` revealed so far. */
  revealed: number;
  /** Which segment this is, so a repeat of the same text still re-enters. */
  segmentIndex: number;
  reducedMotion: boolean;
  onDismiss: () => void;
}

const MODE_CLASS = {
  normal: styles.normal,
  rage: styles.rage,
  whisper: styles.whisper
} as const;

/** §5 — the RGB split decays to nothing over this window. */
const SPLIT_MS = 220;

/**
 * Bare text on the desktop. There is deliberately no panel, bubble, border,
 * radius or background fill here (§2) — legibility comes entirely from the
 * two text shadows in `tokens.css`.
 */
export default function Dialogue({
  segment,
  revealed,
  segmentIndex,
  reducedMotion,
  onDismiss
}: DialogueProps): JSX.Element | null {
  // The chromatic-aberration copies are driven from `data-text`, which would
  // otherwise be rewritten on every revealed character for the whole life of
  // the segment. Carrying it only inside the entry window keeps the two
  // pseudo-elements out of the steady state entirely.
  //
  // `closedFor` is per-mount, and the mount is keyed on the speech id by the
  // caller — a segment index alone would go stale, because a phrase that
  // interrupts another reuses index 0 while this component is still alive.
  const [closedFor, setClosedFor] = useState<number | null>(null);
  const splitting = segment?.mode === 'rage' && !reducedMotion && closedFor !== segmentIndex;

  useEffect(() => {
    if (!splitting) return;
    const timer = window.setTimeout(() => setClosedFor(segmentIndex), SPLIT_MS);
    return () => window.clearTimeout(timer);
  }, [splitting, segmentIndex]);

  if (!segment) return null;

  const text = segment.text.slice(0, revealed);
  const typing = revealed < segment.text.length;

  return (
    <div
      className={styles.zone}
      // The only interactive affordance in the overlay (§10.2). With the panel
      // gone, the text itself is the target.
      data-interactive="true"
      role="button"
      tabIndex={-1}
      onClick={onDismiss}
      title="Dismiss"
    >
      <p
        key={segmentIndex}
        className={`${styles.line} ${MODE_CLASS[segment.mode]} ${
          splitting ? styles.splitting : ''
        }`}
        data-text={splitting ? text : undefined}
      >
        {text}
        {typing && !reducedMotion ? <span className={styles.caret} /> : null}
      </p>
    </div>
  );
}
