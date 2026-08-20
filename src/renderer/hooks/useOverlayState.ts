import { useEffect, useState } from 'react';
import type { CueSources, SkinId } from '@shared/types';

/**
 * The half of `state:update` the overlay cares about. Main pushes it once the
 * window has loaded and again on every settings change, which is what makes
 * the skin switchable at runtime with no restart (§9a).
 */
export function useSkinId(): SkinId | undefined {
  const [skinId, setSkinId] = useState<SkinId | undefined>(undefined);

  useEffect(() => {
    const api = window.codex;
    if (!api) return;
    return api.onStateUpdate((payload) => setSkinId(payload.skinId));
  }, []);

  return skinId;
}

/**
 * Where the two cue sounds come from. Undefined until the first state push;
 * the renderer synthesises both until then, which is also what it does when
 * main reports no files.
 */
export function useCueSources(): CueSources | undefined {
  const [cues, setCues] = useState<CueSources | undefined>(undefined);

  useEffect(() => {
    const api = window.codex;
    if (!api) return;
    return api.onStateUpdate((payload) => setCues(payload.cues));
  }, []);

  return cues;
}
