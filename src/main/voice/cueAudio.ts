import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { CueSources } from '@shared/types';
import { AUDIO_SCHEME } from './PrerenderedVoiceEngine';

/** The two moments the overlay makes a sound. */
export const CUE_IDS = ['appear', 'disappear'] as const;
export type CueId = (typeof CUE_IDS)[number];

/**
 * Tried in order, first match wins. Ogg first to match the voice pipeline;
 * wav and mp3 because a replacement cue is far more likely to arrive as one
 * of those, and Electron plays all three.
 */
export const CUE_EXTENSIONS = ['.ogg', '.wav', '.mp3'] as const;

/**
 * Looks for `appear.*` and `disappear.*` in `resources/audio/cues`.
 *
 * The same bargain the voice engine makes (§14.3): a file present means the
 * file is used, with no setting and no code change. Nothing there means the
 * renderer synthesises the cue instead, so the app always makes both sounds.
 */
export function resolveCueSources(cueDir: string): CueSources {
  const found = (id: CueId): string | null => {
    for (const extension of CUE_EXTENSIONS) {
      if (existsSync(join(cueDir, `${id}${extension}`))) {
        return `${AUDIO_SCHEME}://cue/${id}${extension}`;
      }
    }
    return null;
  };

  return { appear: found('appear'), disappear: found('disappear') };
}
