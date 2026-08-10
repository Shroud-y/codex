import type { PhraseSegment, SpeechMode } from './types';

/**
 * Type-on speed per mode. Shared so that the duration main computes and the
 * reveal the renderer performs cannot drift apart.
 */
export const MS_PER_CHAR: Record<SpeechMode, number> = {
  normal: 28,
  rage: 12,
  whisper: 45
};

export const HOLD_MS = 1800;
export const MIN_DURATION_MS = 3000;
export const MAX_DURATION_MS = 12000;

export function revealMs(segment: PhraseSegment): number {
  return segment.text.length * MS_PER_CHAR[segment.mode];
}

/** §13.3 — sum(chars × msPerChar) + hold, clamped. */
export function computeDurationMs(segments: PhraseSegment[]): number {
  const reveal = segments.reduce((sum, s) => sum + revealMs(s), 0);
  return Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, reveal + HOLD_MS));
}
