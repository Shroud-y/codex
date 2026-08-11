import type { PhraseSegment, ToastPayload } from '@shared/types';
import type { Persona } from '@renderer/personas';
import CharacterUnit from './CharacterUnit/CharacterUnit';
import Dialogue from './Dialogue';
import EventToast from './EventToast';
import styles from './Companion.module.css';

export interface CompanionProps {
  persona: Persona;
  segments: PhraseSegment[];
  activeIndex: number;
  revealed: number;
  visible: boolean;
  reducedMotion: boolean;
  onDismiss: () => void;
  /**
   * Identifies the current phrase. Entry effects are keyed on it, because an
   * interrupting phrase reuses segment index 0 while the previous one is still
   * mounted — without this the second consecutive `rage` opener would enter
   * with no glitch at all.
   */
  speechKey?: string;
  /** Zone C is independent and may render with no speech at all (§3, §6). */
  toast?: ToastPayload | null;
  toastVisible?: boolean;
  /** §4.1 review mode, set only by the design harness. */
  unlit?: boolean;
}

/**
 * The three right-aligned zones of §3. Zone A is fixed geometry; zones B and C
 * grow leftward and upward from fixed anchors, so the window itself never
 * moves however long the line is.
 */
export default function Companion({
  persona,
  segments,
  activeIndex,
  revealed,
  visible,
  reducedMotion,
  onDismiss,
  speechKey = '',
  toast = null,
  toastVisible = true,
  unlit = false
}: CompanionProps): JSX.Element | null {
  const segment = segments[activeIndex] ?? null;
  const mode = visible ? (segment?.mode ?? null) : null;
  const hasSpeech = segments.length > 0;

  // Nothing on screen and nothing to animate out: render nothing at all, so a
  // hidden overlay costs no compositing work.
  if (!visible && !hasSpeech && !toast) return null;

  const typing = segment !== null && revealed < segment.text.length;

  return (
    <div className={styles.root} data-state={visible ? 'in' : 'out'}>
      {hasSpeech ? (
        <>
          {/* Zone A — fixed. Never moves or resizes with the text. */}
          <div className={styles.unitSlot}>
            <CharacterUnit
              persona={persona}
              mode={mode}
              speaking={visible && typing}
              unlit={unlit}
            />
          </div>

          {/* Zone B — anchored at the unit's vertical midpoint; text stacks
              upward above the name label. */}
          <div className={styles.speechZone}>
            <div className={styles.dialogueSlot}>
              <Dialogue
                key={speechKey}
                segment={segment}
                revealed={revealed}
                segmentIndex={activeIndex}
                reducedMotion={reducedMotion}
                onDismiss={onDismiss}
              />
            </div>
            <div className={styles.nameLabel}>{persona.nameLabel}</div>
          </div>
        </>
      ) : null}

      {/* Zone C — independent of the speech entirely. */}
      {toast ? (
        <div className={styles.toastSlot}>
          {/* Keyed too: a replacement toast must replay its entry slide
              rather than swapping its text in place. */}
          <EventToast key={toast.id} toast={toast} visible={visible && toastVisible} />
        </div>
      ) : null}

      {/* Three scanline tears sweep the whole overlay for 150 ms whenever a
          rage segment enters. Keyed on the segment so it re-fires per entry. */}
      {mode === 'rage' && !reducedMotion ? (
        <div className={styles.tears} key={`tear-${speechKey}-${activeIndex}`} aria-hidden="true">
          <span className={styles.tear} />
          <span className={styles.tear} />
          <span className={styles.tear} />
        </div>
      ) : null}
    </div>
  );
}
