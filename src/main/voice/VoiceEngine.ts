import type { PhraseSegment } from '@shared/types';

export interface SpeakRequest {
  phraseId: string;
  segments: PhraseSegment[];
}

export interface VoiceEngine {
  /** Resolves when playback ends. */
  speak(req: SpeakRequest): Promise<void>;
  stop(): void;
  readonly available: boolean;

  /**
   * Optional seam: lets the director attach an audio URL to the same
   * 'speech:show' message the overlay already receives, so audio playback
   * needs no extra IPC channel (§12, §14.3). Engines without audio omit it.
   */
  prepare?(phraseId: string): Promise<string | null> | string | null;
}
