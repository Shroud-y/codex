import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { presetVideoFileName, resolvePresetVideoFile } from '@main/media/appearanceVideo';

let dir: string | null = null;

function presetDir(files: string[]): string {
  dir = mkdtempSync(join(tmpdir(), 'codex-video-'));
  const preset = join(dir, 'preset');
  mkdirSync(preset);
  for (const name of files) writeFileSync(join(preset, name), '');
  return preset;
}

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

describe('resolvePresetVideoFile', () => {
  it('reports nothing when the preset has no override', () => {
    expect(resolvePresetVideoFile(presetDir([]))).toBeNull();
  });

  it('reports nothing when the folder does not exist at all', () => {
    expect(resolvePresetVideoFile(join(tmpdir(), 'codex-video-missing-xyz'))).toBeNull();
  });

  it('finds a .webm', () => {
    const path = presetDir(['appearance.webm']);
    expect(resolvePresetVideoFile(path)).toBe(join(path, 'appearance.webm'));
  });

  it('finds a .mp4', () => {
    const path = presetDir(['appearance.mp4']);
    expect(resolvePresetVideoFile(path)).toBe(join(path, 'appearance.mp4'));
  });

  it('prefers .webm over .mp4 when both exist', () => {
    const path = presetDir(['appearance.mp4', 'appearance.webm']);
    expect(resolvePresetVideoFile(path)).toBe(join(path, 'appearance.webm'));
  });

  it('ignores a file that is not named appearance.*', () => {
    expect(resolvePresetVideoFile(presetDir(['clip.webm']))).toBeNull();
  });

  it('ignores an unsupported extension', () => {
    expect(resolvePresetVideoFile(presetDir(['appearance.gif']))).toBeNull();
  });
});

describe('presetVideoFileName', () => {
  it('returns just the filename, for building the asset URL', () => {
    const path = presetDir(['appearance.mp4']);
    expect(presetVideoFileName(path)).toBe('appearance.mp4');
  });

  it('returns null when there is no override', () => {
    expect(presetVideoFileName(presetDir([]))).toBeNull();
  });
});
