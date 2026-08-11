import { useCallback, useEffect, useRef, useState } from 'react';
import type { PhraseSegment, SpeechShowPayload } from '@shared/types';
import { MS_PER_CHAR } from '@shared/speechTiming';

/**
 * §5 — the unit slides in, the name label follows at +120 ms, and the text
 * begins typing at +200 ms. Typing therefore starts late rather than starting
 * on time behind an invisible element, which would swallow the first few
 * characters of the reveal.
 */
const ENTRY_DELAY_MS = 200;

export interface SpeechView {
  speech: SpeechShowPayload | null;
  visible: boolean;
  /** Index of the segment currently typing. */
  activeIndex: number;
  /** Characters revealed of the active segment. */
  revealed: number;
  reducedMotion: boolean;
  /** False until the entry animation has played far enough to type. */
  armed: boolean;
  dismiss: () => void;
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

/**
 * Presentation only. Every timing decision that matters (whether to speak, for
 * how long) is made in main; this drives the type-on reveal and reports back.
 */
export function useSpeech(): SpeechView {
  const [speech, setSpeech] = useState<SpeechShowPayload | null>(null);
  const [visible, setVisible] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [revealed, setRevealed] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  const [armed, setArmed] = useState(false);

  const finishTimer = useRef<number | null>(null);
  const typeTimer = useRef<number | null>(null);
  const teardownTimer = useRef<number | null>(null);
  const armTimer = useRef<number | null>(null);
  const speechRef = useRef<SpeechShowPayload | null>(null);

  const clearTimers = useCallback(() => {
    if (finishTimer.current !== null) {
      window.clearTimeout(finishTimer.current);
      finishTimer.current = null;
    }
    if (typeTimer.current !== null) {
      window.clearTimeout(typeTimer.current);
      typeTimer.current = null;
    }
    if (teardownTimer.current !== null) {
      window.clearTimeout(teardownTimer.current);
      teardownTimer.current = null;
    }
    if (armTimer.current !== null) {
      window.clearTimeout(armTimer.current);
      armTimer.current = null;
    }
  }, []);

  /**
   * Once the exit animation has played, drop the speech entirely so the
   * companion unmounts. A hidden window still runs CSS animations — and with
   * `backgroundThrottling: false` Chromium will not throttle them — which
   * costs measurable idle CPU for something nobody can see.
   */
  const scheduleTeardown = useCallback(() => {
    if (teardownTimer.current !== null) window.clearTimeout(teardownTimer.current);
    teardownTimer.current = window.setTimeout(() => {
      teardownTimer.current = null;
      speechRef.current = null;
      setSpeech(null);
      setActiveIndex(0);
      setRevealed(0);
      setArmed(false);
      // §5 exit: the text fades for 140 ms, then the unit slides out over
      // 260 ms. Unmounting before that finishes would clip the slide.
    }, 440);
  }, []);

  const dismiss = useCallback(() => {
    const current = speechRef.current;
    if (!current) return;
    clearTimers();
    setVisible(false);
    scheduleTeardown();
    window.codex?.speechDismissed(current.speechId);
  }, [clearTimers, scheduleTeardown]);

  /* ---- media query ------------------------------------------------ */
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (): void => setReducedMotion(query.matches);
    query.addEventListener('change', handler);
    return () => query.removeEventListener('change', handler);
  }, []);

  /* ---- IPC wiring -------------------------------------------------- */
  useEffect(() => {
    const api = window.codex;
    if (!api) return;

    const offShow = api.onSpeechShow((payload) => {
      clearTimers();
      speechRef.current = payload;
      setSpeech(payload);
      setActiveIndex(0);
      setRevealed(0);
      setVisible(true);
      setArmed(false);
      armTimer.current = window.setTimeout(() => {
        armTimer.current = null;
        setArmed(true);
      }, ENTRY_DELAY_MS);

      // Report completion at exactly the duration main computed, so the two
      // sides can never drift.
      finishTimer.current = window.setTimeout(() => {
        finishTimer.current = null;
        window.codex?.speechFinished(payload.speechId);
      }, payload.durationMs);
    });

    const offHide = api.onSpeechHide(() => {
      clearTimers();
      setVisible(false);
      scheduleTeardown();
    });

    const offInterrupt = api.onSpeechInterrupt(() => {
      clearTimers();
      setVisible(false);
      scheduleTeardown();
    });

    return () => {
      offShow();
      offHide();
      offInterrupt();
      clearTimers();
    };
  }, [clearTimers, scheduleTeardown]);

  const activeSegment: PhraseSegment | undefined = speech?.segments[activeIndex];
  // Under reduced motion the text appears whole, so the revealed count is
  // derived rather than stored — no per-character state churn at all.
  const effectiveRevealed = reducedMotion ? (activeSegment?.text.length ?? 0) : revealed;

  /* ---- type-on reveal --------------------------------------------- */
  useEffect(() => {
    if (!speech || !visible || !activeSegment || !armed) return;
    const isLast = activeIndex >= speech.segments.length - 1;

    if (reducedMotion) {
      if (isLast) return;
      typeTimer.current = window.setTimeout(() => setActiveIndex((i) => i + 1), 600);
    } else if (revealed < activeSegment.text.length) {
      typeTimer.current = window.setTimeout(
        () => setRevealed((n) => n + 1),
        MS_PER_CHAR[activeSegment.mode]
      );
    } else if (!isLast) {
      // Segment complete. The jump to the next one is instantaneous — the
      // discontinuity is the character.
      typeTimer.current = window.setTimeout(() => {
        setActiveIndex((i) => i + 1);
        setRevealed(0);
      }, 0);
    }

    return () => {
      if (typeTimer.current !== null) {
        window.clearTimeout(typeTimer.current);
        typeTimer.current = null;
      }
    };
  }, [speech, visible, activeSegment, activeIndex, revealed, reducedMotion, armed]);

  return {
    speech,
    visible,
    activeIndex,
    revealed: effectiveRevealed,
    reducedMotion,
    armed,
    dismiss
  };
}
