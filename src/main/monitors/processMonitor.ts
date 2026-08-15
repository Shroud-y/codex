import type { EventBus } from '../core/eventBus';
import { EventType, createEvent } from '../core/events';
import { createLogger } from '../log/logger';
import type { Monitor, SharedScheduler } from './Monitor';

const log = createLogger('monitor:process');

const POLL_MS = 20_000;
const LONG_RUNNING_MS = 4 * 60 * 60_000;

/** Returns the running executables, or null when the reading is unavailable. */
export type ProcessLister = () => Promise<Set<string> | null>;

/**
 * The watchlist is written `chrome.exe` and the reading comes back `chrome`.
 * Comparing stems means neither spelling has to be the canonical one, and a
 * user who types the extension — or forgets it — matches either way.
 */
export function processStem(name: string): string {
  const lower = name.trim().toLowerCase();
  return lower.endsWith('.exe') ? lower.slice(0, -'.exe'.length) : lower;
}

/**
 * §9.2 — diff a set of running executables against the previous tick, but only
 * for watchlisted names. Emitting every process would bury the bus.
 */
export class ProcessMonitor implements Monitor {
  readonly id = 'process';

  private running = new Map<string, number>();
  private longRunningReported = new Set<string>();
  private primed = false;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly scheduler: SharedScheduler,
    private readonly getWatchlist: () => string[],
    private readonly listProcesses: ProcessLister
  ) {}

  start(bus: EventBus): void {
    this.unsubscribe = this.scheduler.every(POLL_MS, (now) => this.poll(bus, now));
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private async poll(bus: EventBus, now: number): Promise<void> {
    // Keyed by stem, valued by the spelling the user wrote — events carry the
    // watchlist's own wording rather than whatever the reading happened to use.
    const watchlist = new Map<string, string>();
    for (const entry of this.getWatchlist()) {
      const stem = processStem(entry);
      if (stem.length > 0) watchlist.set(stem, entry.trim().toLowerCase());
    }
    if (watchlist.size === 0) return;

    let running: Set<string> | null;
    try {
      running = await this.listProcesses();
    } catch (err) {
      log.debug(`process poll failed: ${String(err)}`);
      return;
    }
    // No reading is not the same as "nothing is running": treating it as an
    // empty set would fire a stopped event for everything on the watchlist.
    if (running === null) return;

    const names = new Set<string>();
    for (const entry of running) {
      const label = watchlist.get(processStem(entry));
      if (label !== undefined) names.add(label);
    }

    // The first tick establishes the baseline; everything already running is
    // not news.
    if (!this.primed) {
      this.primed = true;
      for (const name of names) this.running.set(name, now);
      return;
    }

    for (const name of names) {
      if (!this.running.has(name)) {
        this.running.set(name, now);
        bus.emit(createEvent(EventType.processStarted, 'ambient', { name }, now));
      }
    }

    for (const [name, startedAt] of [...this.running]) {
      if (!names.has(name)) {
        this.running.delete(name);
        this.longRunningReported.delete(name);
        bus.emit(
          createEvent(EventType.processStopped, 'ambient', { name, ranForMs: now - startedAt }, now)
        );
        continue;
      }
      if (now - startedAt >= LONG_RUNNING_MS && !this.longRunningReported.has(name)) {
        this.longRunningReported.add(name);
        bus.emit(
          createEvent(
            EventType.processLongRunning,
            'ambient',
            { name, ranForMs: now - startedAt, hours: (now - startedAt) / 3_600_000 },
            now
          )
        );
      }
    }
  }
}
