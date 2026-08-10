import type { StatePayload } from '@shared/types';

export type SnoozeChoice = '30m' | '2h' | 'restart' | 'off';

/** Mute and snooze — the two user-facing kill switches (§11). */
export class RuntimeState {
  private muted = false;
  private snoozedUntil: number | null = null;
  private snoozedForSession = false;
  private readonly listeners = new Set<(state: StatePayload) => void>();

  onChange(listener: (state: StatePayload) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get isMuted(): boolean {
    return this.muted;
  }

  snoozeUntil(now: number): number | null {
    if (this.snoozedForSession) return Number.POSITIVE_INFINITY;
    if (this.snoozedUntil !== null && this.snoozedUntil <= now) {
      this.snoozedUntil = null;
      this.emit();
    }
    return this.snoozedUntil;
  }

  setMuted(muted: boolean): void {
    if (this.muted === muted) return;
    this.muted = muted;
    this.emit();
  }

  toggleMute(): void {
    this.setMuted(!this.muted);
  }

  setSnooze(choice: SnoozeChoice, now: number): void {
    switch (choice) {
      case '30m':
        this.snoozedForSession = false;
        this.snoozedUntil = now + 30 * 60_000;
        break;
      case '2h':
        this.snoozedForSession = false;
        this.snoozedUntil = now + 2 * 60 * 60_000;
        break;
      case 'restart':
        this.snoozedForSession = true;
        this.snoozedUntil = null;
        break;
      case 'off':
        this.snoozedForSession = false;
        this.snoozedUntil = null;
        break;
    }
    this.emit();
  }

  get snoozedForRestart(): boolean {
    return this.snoozedForSession;
  }

  payload(now: number): StatePayload {
    const until = this.snoozeUntil(now);
    return {
      muted: this.muted,
      snoozedUntil: until === Number.POSITIVE_INFINITY ? null : until
    };
  }

  private emit(): void {
    const payload = this.payload(Date.now());
    for (const listener of this.listeners) listener(payload);
  }
}
