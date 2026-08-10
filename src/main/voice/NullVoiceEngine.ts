import { computeDurationMs } from '@shared/speechTiming';
import type { SpeakRequest, VoiceEngine } from './VoiceEngine';

/**
 * §14.2 — Phase 1 default. Text-only is a first-class mode, not a degraded
 * one: `speak()` simply resolves after the computed display duration.
 */
export class NullVoiceEngine implements VoiceEngine {
  readonly available = false;
  private timer: NodeJS.Timeout | null = null;
  private resolveCurrent: (() => void) | null = null;

  speak(req: SpeakRequest): Promise<void> {
    this.stop();
    const duration = computeDurationMs(req.segments);
    return new Promise<void>((resolve) => {
      this.resolveCurrent = resolve;
      this.timer = setTimeout(() => {
        this.timer = null;
        this.resolveCurrent = null;
        resolve();
      }, duration);
    });
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.resolveCurrent) {
      const resolve = this.resolveCurrent;
      this.resolveCurrent = null;
      resolve();
    }
  }
}
