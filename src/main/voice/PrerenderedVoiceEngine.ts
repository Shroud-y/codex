import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { computeDurationMs } from '@shared/speechTiming';
import { NullVoiceEngine } from './NullVoiceEngine';
import type { SpeakRequest, VoiceEngine } from './VoiceEngine';

/** Custom scheme so the overlay can load audio in both dev and packaged builds. */
export const AUDIO_SCHEME = 'codex-audio';

export interface PrerenderedVoiceEngineOptions {
  /** Directory holding `<phraseId>.ogg`. */
  audioDir: string;
  /**
   * Resolves when the overlay reports playback finished for `phraseId`, or
   * after `timeoutMs` — the renderer is not trusted to always ack.
   */
  awaitPlayback: (phraseId: string, timeoutMs: number) => Promise<void>;
  logDebug?: (message: string) => void;
}

/**
 * §14.3 — implemented now, activated the moment `.ogg` files appear. A
 * partially-voiced bank must work, so a missing file silently delegates to the
 * null engine (logged once per phrase at debug level).
 */
export class PrerenderedVoiceEngine implements VoiceEngine {
  readonly available = true;
  private readonly fallback = new NullVoiceEngine();
  private readonly reportedMissing = new Set<string>();
  private stopped = false;

  constructor(private readonly options: PrerenderedVoiceEngineOptions) {}

  private fileFor(phraseId: string): string {
    return join(this.options.audioDir, `${phraseId}.ogg`);
  }

  hasAudio(phraseId: string): boolean {
    return existsSync(this.fileFor(phraseId));
  }

  prepare(phraseId: string): string | null {
    if (!this.hasAudio(phraseId)) {
      if (!this.reportedMissing.has(phraseId)) {
        this.reportedMissing.add(phraseId);
        this.options.logDebug?.(`no audio for phrase "${phraseId}" — falling back to text only`);
      }
      return null;
    }
    return `${AUDIO_SCHEME}://phrase/${encodeURIComponent(phraseId)}.ogg`;
  }

  async speak(req: SpeakRequest): Promise<void> {
    this.stopped = false;
    if (!this.hasAudio(req.phraseId)) {
      return this.fallback.speak(req);
    }
    // Display duration is the floor; audio may run slightly longer, so give the
    // renderer a generous grace period before we assume the ack was lost.
    const timeout = computeDurationMs(req.segments) + 10_000;
    await this.options.awaitPlayback(req.phraseId, timeout);
    if (this.stopped) return;
  }

  stop(): void {
    this.stopped = true;
    this.fallback.stop();
  }
}

/** §14.3 — engine selection is automatic: audio present means audio is used. */
export function audioDirHasFiles(audioDir: string): boolean {
  try {
    return readdirSync(audioDir).some((name) => name.toLowerCase().endsWith('.ogg'));
  } catch {
    return false;
  }
}
