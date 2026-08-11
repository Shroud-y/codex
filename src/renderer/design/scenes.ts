import type { PhraseSegment, ToastPayload } from '@shared/types';

export interface Scene {
  id: string;
  label: string;
  segments: PhraseSegment[];
  /** Which segment is on screen. */
  activeIndex: number;
  /**
   * Characters revealed of that segment, or `null` for the finished state.
   * A number short of the segment length is a mid-type snapshot.
   */
  revealed: number | null;
  toast: ToastPayload | null;
}

const toast = (text: string, glyph: ToastPayload['glyph']): ToastPayload => ({
  id: 'preview',
  text,
  glyph,
  durationMs: 6000
});

const FOUR_LINES =
  'Your build finished eleven minutes ago. The test suite has been red for ' +
  'six of them, and you have not looked at it once. I am not judging. I am ' +
  'simply keeping a record.';

/** Every state §7 asks to be able to see without waiting for a real trigger. */
export const SCENES: Scene[] = [
  {
    id: 'normal-one-line',
    label: 'normal · one line',
    segments: [{ text: 'Build finished. Four minutes, twelve seconds.', mode: 'normal' }],
    activeIndex: 0,
    revealed: null,
    toast: null
  },
  {
    id: 'normal-four-lines',
    label: 'normal · four lines',
    segments: [{ text: FOUR_LINES, mode: 'normal' }],
    activeIndex: 0,
    revealed: null,
    toast: null
  },
  {
    id: 'normal-typing',
    label: 'normal · mid-type',
    segments: [{ text: FOUR_LINES, mode: 'normal' }],
    activeIndex: 0,
    revealed: 74,
    toast: null
  },
  {
    id: 'rage',
    label: 'rage',
    segments: [{ text: 'that is the third time you have deleted it', mode: 'rage' }],
    activeIndex: 0,
    revealed: null,
    toast: null
  },
  {
    id: 'whisper',
    label: 'whisper',
    segments: [{ text: 'nobody has committed anything since tuesday', mode: 'whisper' }],
    activeIndex: 0,
    revealed: null,
    toast: null
  },
  {
    id: 'glitch',
    label: 'multi-segment · mid-transition',
    segments: [
      { text: 'It compiled on the first attempt.', mode: 'normal' },
      { text: 'which is statistically impossible', mode: 'rage' },
      { text: 'I withdraw the observation.', mode: 'whisper' }
    ],
    activeIndex: 1,
    revealed: 18,
    toast: null
  },
  {
    id: 'toast-only',
    label: 'toast alone',
    segments: [],
    activeIndex: 0,
    revealed: null,
    toast: toast('Build finished — 4m 12s', 'build')
  },
  {
    id: 'toast-speech',
    label: 'toast + speech',
    segments: [{ text: 'Four minutes. I have seen worse from you.', mode: 'normal' }],
    activeIndex: 0,
    revealed: null,
    toast: toast('Build finished — 4m 12s', 'build')
  },
  {
    id: 'toast-disk',
    label: 'toast alone · disk',
    segments: [],
    activeIndex: 0,
    revealed: null,
    toast: toast('C: is below 8 GB free', 'disk')
  }
];
