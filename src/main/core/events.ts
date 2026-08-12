import { randomUUID } from 'node:crypto';

export type EventPriority = 'ambient' | 'notable' | 'urgent';

export interface AppEvent<T = unknown> {
  /** uuid */
  id: string;
  /** dot-namespaced, e.g. 'system.cpu.high' */
  type: string;
  /** Date.now() */
  at: number;
  priority: EventPriority;
  payload: T;
}

/** Canonical Phase 1 event types (§5). */
export const EventType = {
  sessionStartup: 'session.startup',
  sessionResume: 'session.resume',
  sessionIdleEnter: 'session.idle.enter',
  sessionIdleExit: 'session.idle.exit',
  sessionLock: 'session.lock',
  sessionUnlock: 'session.unlock',

  systemCpuHigh: 'system.cpu.high',
  systemCpuSustained: 'system.cpu.sustained',
  systemMemoryHigh: 'system.memory.high',
  systemDiskLow: 'system.disk.low',
  systemTemperatureHigh: 'system.temperature.high',
  systemBatteryLow: 'system.battery.low',

  processStarted: 'process.started',
  processStopped: 'process.stopped',
  processLongRunning: 'process.longRunning',

  scheduleMorning: 'schedule.morning',
  scheduleEvening: 'schedule.evening',
  scheduleNight: 'schedule.night',
  scheduleHourly: 'schedule.hourly',
  scheduleWorkBreak: 'schedule.workBreak',
  scheduleUptimeMilestone: 'schedule.uptimeMilestone',
  scheduleQuiet: 'schedule.quiet',

  fileDownloadComplete: 'file.downloadComplete',
  fileBuildComplete: 'file.buildComplete'
} as const;

export type KnownEventType = (typeof EventType)[keyof typeof EventType];

export const ALL_EVENT_TYPES: string[] = Object.values(EventType);

/** Priority each canonical type is emitted with; also used by the debug panel. */
export const EVENT_PRIORITY: Record<string, EventPriority> = {
  [EventType.sessionStartup]: 'notable',
  [EventType.sessionResume]: 'notable',
  [EventType.sessionIdleEnter]: 'ambient',
  [EventType.sessionIdleExit]: 'notable',
  [EventType.sessionLock]: 'ambient',
  [EventType.sessionUnlock]: 'notable',

  [EventType.systemCpuHigh]: 'ambient',
  [EventType.systemCpuSustained]: 'notable',
  [EventType.systemMemoryHigh]: 'ambient',
  [EventType.systemDiskLow]: 'urgent',
  [EventType.systemTemperatureHigh]: 'urgent',
  [EventType.systemBatteryLow]: 'urgent',

  [EventType.processStarted]: 'ambient',
  [EventType.processStopped]: 'ambient',
  [EventType.processLongRunning]: 'ambient',

  [EventType.scheduleMorning]: 'ambient',
  [EventType.scheduleEvening]: 'ambient',
  [EventType.scheduleNight]: 'ambient',
  [EventType.scheduleHourly]: 'ambient',
  [EventType.scheduleWorkBreak]: 'notable',
  [EventType.scheduleUptimeMilestone]: 'ambient',
  [EventType.scheduleQuiet]: 'ambient',

  [EventType.fileDownloadComplete]: 'notable',
  [EventType.fileBuildComplete]: 'notable'
};

export function defaultPriorityFor(type: string): EventPriority {
  return EVENT_PRIORITY[type] ?? 'ambient';
}

export function createEvent<T>(
  type: string,
  priority: EventPriority,
  payload: T,
  now: number = Date.now()
): AppEvent<T> {
  return { id: randomUUID(), type, at: now, priority, payload };
}

/** Matches an event type against a pattern; a trailing '*' is a prefix wildcard. */
export function eventTypeMatches(pattern: string, type: string): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith('*')) return type.startsWith(pattern.slice(0, -1));
  return pattern === type;
}
