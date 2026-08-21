import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';

/**
 * A GIF's animation is CPU-decoded frame by frame in Chromium — there is no
 * hardware path for it the way there is for video. In an always-on-top
 * transparent overlay window, competing with whatever else is hooking the
 * compositor on the user's machine, that CPU decode step visibly stutters
 * even for a small, well-formed file. A `<video>` element gets Chromium's
 * hardware-accelerated decode path instead, which is the actual fix rather
 * than a smaller file.
 */
export const VIDEO_EXTENSIONS = ['.webm', '.mp4'] as const;
export type VideoExtension = (typeof VIDEO_EXTENSIONS)[number];

/** Tried in order, first match wins — same convention as `resolveCueSources`. */
export function resolvePresetVideoFile(presetDir: string): string | null {
  for (const ext of VIDEO_EXTENSIONS) {
    const file = join(presetDir, `appearance${ext}`);
    if (existsSync(file)) return file;
  }
  return null;
}

/** The bare filename part of a resolved video file, for building its URL. */
export function presetVideoFileName(presetDir: string): string | null {
  const file = resolvePresetVideoFile(presetDir);
  return file ? basename(file) : null;
}
