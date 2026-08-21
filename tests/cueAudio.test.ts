import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveCueSources, resolvePresetCueSources } from '@main/voice/cueAudio';

let dir: string | null = null;

function cueDir(files: string[]): string {
  dir = mkdtempSync(join(tmpdir(), 'codex-cues-'));
  const cues = join(dir, 'cues');
  mkdirSync(cues);
  for (const name of files) writeFileSync(join(cues, name), '');
  return cues;
}

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

describe('resolveCueSources', () => {
  it('reports nothing when the folder is empty, so the renderer synthesises', () => {
    expect(resolveCueSources(cueDir([]))).toEqual({ appear: null, disappear: null });
  });

  it('reports nothing when the folder does not exist at all', () => {
    expect(resolveCueSources(join(tmpdir(), 'codex-cues-missing-xyz'))).toEqual({
      appear: null,
      disappear: null
    });
  });

  it('resolves each cue independently — one file replaced, one synthesised', () => {
    expect(resolveCueSources(cueDir(['appear.wav']))).toEqual({
      appear: 'codex-audio://cue/appear.wav',
      disappear: null
    });
  });

  it('prefers .ogg, then .wav, then .mp3', () => {
    expect(resolveCueSources(cueDir(['appear.mp3', 'appear.wav', 'appear.ogg'])).appear).toBe(
      'codex-audio://cue/appear.ogg'
    );
    expect(resolveCueSources(cueDir(['appear.mp3', 'appear.wav'])).appear).toBe(
      'codex-audio://cue/appear.wav'
    );
  });

  it('ignores files that are not one of the two cue names', () => {
    expect(resolveCueSources(cueDir(['show.ogg', 'appear.flac']))).toEqual({
      appear: null,
      disappear: null
    });
  });
});

describe('resolvePresetCueSources', () => {
  /**
   * The bug this guards against: a preset's cue file resolved to a
   * `codex-audio://cue/<file>` URL loads correctly on disk (the file really
   * is there) but 404s in the renderer, because that host is wired to the
   * one shipped `resources/audio/cues` directory regardless of which
   * preset asked — so the URL has to name the preset itself.
   */
  it('names the preset in the URL, not just the file', () => {
    expect(resolvePresetCueSources(cueDir(['disappear.mp3']), 'my-preset', 'codex-asset')).toEqual({
      appear: null,
      disappear: 'codex-asset://cue/my-preset/disappear.mp3'
    });
  });

  it('reports nothing when the preset has no override', () => {
    expect(resolvePresetCueSources(cueDir([]), 'my-preset', 'codex-asset')).toEqual({
      appear: null,
      disappear: null
    });
  });

  it('still prefers .ogg, then .wav, then .mp3', () => {
    expect(
      resolvePresetCueSources(cueDir(['appear.mp3', 'appear.wav', 'appear.ogg']), 'p', 'codex-asset').appear
    ).toBe('codex-asset://cue/p/appear.ogg');
  });
});
