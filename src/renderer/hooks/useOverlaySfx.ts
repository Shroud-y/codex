import { useEffect, useRef } from 'react';
import type { CueSources } from '@shared/types';
import type { AudioOptions } from './useOverlayState';
import { playAppear, playDisappear, setAudioOptions, setCueSources } from '@renderer/audio/cues';

/**
 * Fires the two cues off the visibility edge, not off `speech:show` — that is
 * the same edge the entry and exit animations run on, so the sound and the
 * slide stay together however the overlay was dismissed (finished, hidden,
 * interrupted, or clicked away).
 *
 * Nothing plays on mount: the overlay window is created at startup and lives
 * hidden, and an announcement at login would be the wrong first impression.
 */
export function useOverlaySfx(visible: boolean, cues?: CueSources, audioOptions?: AudioOptions): void {
  const previous = useRef(false);

  // Whatever main found on disk replaces the synthesised cue; see `cues.ts`.
  useEffect(() => {
    if (cues) setCueSources(cues);
  }, [cues]);

  useEffect(() => {
    if (audioOptions) setAudioOptions(audioOptions);
  }, [audioOptions]);

  useEffect(() => {
    if (visible === previous.current) return;
    previous.current = visible;
    if (visible) playAppear();
    else playDisappear();
  }, [visible]);
}
