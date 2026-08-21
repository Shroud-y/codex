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
 * Looks for `appear.*` and `disappear.*` in a directory, building each found
 * file's URL with `buildUrl`. The same bargain the voice engine makes
 * (§14.3): a file present means the file is used, with no setting and no
 * code change. Nothing there means the renderer synthesises the cue instead,
 * so the app always makes both sounds.
 */
function findCueSources(cueDir: string, buildUrl: (id: CueId, extension: string) => string): CueSources {
  const found = (id: CueId): string | null => {
    for (const extension of CUE_EXTENSIONS) {
      if (existsSync(join(cueDir, `${id}${extension}`))) {
        return buildUrl(id, extension);
      }
    }
    return null;
  };

  return { appear: found('appear'), disappear: found('disappear') };
}

/** Resolves the shipped `resources/audio/cues` directory, served by `registerAudioProtocol`. */
export function resolveCueSources(cueDir: string): CueSources {
  return findCueSources(cueDir, (id, extension) => `${AUDIO_SCHEME}://cue/${id}${extension}`);
}

/**
 * Resolves a preset's own cue directory. This can't reuse `resolveCueSources`
 * as-is: that always builds a `codex-audio://cue/<file>` URL, and that host
 * is wired to the one shipped cues directory (`registerAudioProtocol`) — it
 * has no way to tell one preset's cue apart from another's. The URL has to
 * name the preset itself, so it goes through `assetScheme` (`codex-asset:`)
 * instead, served by `registerAssetProtocol`.
 */
export function resolvePresetCueSources(cueDir: string, presetId: string, assetScheme: string): CueSources {
  return findCueSources(cueDir, (id, extension) => `${assetScheme}://cue/${presetId}/${id}${extension}`);
}
