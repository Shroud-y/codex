import si from 'systeminformation';
import type { EventBus } from '../core/eventBus';
import { EventType, createEvent } from '../core/events';
import { createLogger } from '../log/logger';
import type { Monitor, SharedScheduler } from './Monitor';

const log = createLogger('monitor:process');

const POLL_MS = 20_000;
const LONG_RUNNING_MS = 4 * 60 * 60_000;

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
    private readonly getWatchlist: () => string[]
  ) {}

  start(bus: EventBus): void {
    this.unsubscribe = this.scheduler.every(POLL_MS, (now) => this.poll(bus, now));
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private async poll(bus: EventBus, now: number): Promise<void> {
    const watchlist = new Set(this.getWatchlist().map((name) => name.toLowerCase()));
    if (watchlist.size === 0) return;

    let names: Set<string>;
    try {
      const list = await si.processes();
      names = new Set(
        list.list
          .map((proc) => (proc.name ?? '').toLowerCase())
          .filter((name) => watchlist.has(name))
      );
    } catch (err) {
      log.debug(`process poll failed: ${String(err)}`);
      return;
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
