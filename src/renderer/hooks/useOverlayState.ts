import { useEffect, useState } from 'react';
import type { SkinId } from '@shared/types';

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
