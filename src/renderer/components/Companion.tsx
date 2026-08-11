import type { CSSProperties } from 'react';
import type { PhraseSegment, SkinId, ToastPayload } from '@shared/types';
import type { Persona } from '@renderer/personas';
import { getSkin } from '@renderer/skins';
import CharacterUnit from './CharacterUnit';
import Dialogue from './Dialogue';
import EventToast from './EventToast';
import styles from './Companion.module.css';

/**
 * Distance from the top of the label's line box down to its baseline, for
 * 13 px Saira: half-leading plus the ascent. The label is positioned by this
 * so its *baseline* lands on the optic centre (§1.2), not its box.
 */
const LABEL_BASELINE_PX = 11;

export interface CompanionProps {
  persona: Persona;
  /** Overrides the persona's default skin; supplied by settings. */
  skinId?: SkinId;
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
  skinId,
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

  // §1.2 — the label's baseline sits on the optic's vertical centre, so speech
  // reads as coming from the character rather than floating beside it. Every
  // skin declares where its optic is, so this holds when the skin changes.
  const skin = getSkin(skinId ?? persona.defaultSkin);
  const zones = {
    '--optic-y': `${skin.opticCenter.y}px`,
    '--label-baseline': `${LABEL_BASELINE_PX}px`,
    '--unit-w': `${skin.canvas.width}px`
  } as CSSProperties;

  return (
    <div className={styles.root} style={zones} data-state={visible ? 'in' : 'out'}>
      {hasSpeech ? (
        <>
          {/* Zone A — fixed. Never moves or resizes with the text. */}
          <div className={styles.unitSlot}>
            <CharacterUnit
              persona={persona}
              skinId={skinId}
              mode={mode}
              speaking={visible && typing}
              reducedMotion={reducedMotion}
              unlit={unlit}
            />
          </div>

          {/* Zone B — the label is pinned to the optic and never moves; the
              dialogue hangs beneath it (§1.1). */}
          <div className={styles.speechZone}>
            <div className={styles.nameLabel}>{persona.nameLabel}</div>
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
