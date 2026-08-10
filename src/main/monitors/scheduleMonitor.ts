import { uptime } from 'node:os';
import type { EventBus } from '../core/eventBus';
import { EventType, createEvent } from '../core/events';
import type { Monitor, SharedScheduler } from './Monitor';

const POLL_MS = 60_000;
const WORK_BREAK_MS = 90 * 60_000;
const UPTIME_MILESTONES_HOURS = [24, 72];

function dayKey(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** §9.5 — wall-clock checks, once a minute. */
export class ScheduleMonitor implements Monitor {
  readonly id = 'schedule';

  private firedToday = new Map<string, string>();
  private lastHourFired = -1;
  private activeSince: number | null = null;
  private lastBreakAt = 0;
  private milestonesFired = new Set<number>();
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly scheduler: SharedScheduler,
    private readonly isIdle: () => boolean
  ) {}

  start(bus: EventBus): void {
    this.unsubscribe = this.scheduler.every(POLL_MS, (now) => this.poll(bus, now));
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private oncePerDay(key: string, now: number): boolean {
    const today = dayKey(now);
    if (this.firedToday.get(key) === today) return false;
    this.firedToday.set(key, today);
    return true;
  }

  private poll(bus: EventBus, now: number): void {
    const date = new Date(now);
    const hour = date.getHours();
    const idle = this.isIdle();

    // Time of day — each fires at most once per calendar day, and only while
    // the user is actually at the machine.
    if (!idle) {
      if (hour >= 5 && hour < 12 && this.oncePerDay('morning', now)) {
        bus.emit(createEvent(EventType.scheduleMorning, 'ambient', { hour }, now));
      }
      if (hour >= 19 && hour < 23 && this.oncePerDay('evening', now)) {
        bus.emit(createEvent(EventType.scheduleEvening, 'ambient', { hour }, now));
      }
      if ((hour >= 1 && hour < 5) && this.oncePerDay('night', now)) {
        bus.emit(createEvent(EventType.scheduleNight, 'ambient', { hour }, now));
      }
      if (hour !== this.lastHourFired && date.getMinutes() === 0) {
        this.lastHourFired = hour;
        bus.emit(createEvent(EventType.scheduleHourly, 'ambient', { hour }, now));
      }
    }

    // Continuous non-idle activity → break reminder.
    if (idle) {
      this.activeSince = null;
    } else {
      this.activeSince ??= now;
      const activeFor = now - this.activeSince;
      if (activeFor >= WORK_BREAK_MS && now - this.lastBreakAt >= WORK_BREAK_MS) {
        this.lastBreakAt = now;
        bus.emit(
          createEvent(
            EventType.scheduleWorkBreak,
            'notable',
            { activeMs: activeFor, activeMinutes: Math.round(activeFor / 60_000) },
            now
          )
        );
      }
    }

    // Machine uptime milestones.
    const uptimeHours = uptime() / 3600;
    for (const milestone of UPTIME_MILESTONES_HOURS) {
      if (uptimeHours >= milestone && !this.milestonesFired.has(milestone)) {
        this.milestonesFired.add(milestone);
        bus.emit(
          createEvent(EventType.scheduleUptimeMilestone, 'ambient', { hours: milestone }, now)
        );
      }
    }
  }
}
