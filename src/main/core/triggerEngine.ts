/**
 * §7 — maps an event to candidate phrase groups. Rules are data, in one array,
 * in this file. The engine knows nothing about timing beyond `minIntervalMs`
 * and never touches the overlay.
 */

import type { AppEvent, EventPriority } from './events';
import { eventTypeMatches } from './events';
import type { Condition, ConditionContext } from './conditions';
import { evaluateConditions } from './conditions';
import type { PhraseBankIndex } from './phraseBank';
import type { Rng } from './selector';

export interface TriggerRule {
  id: string;
  /** Event type(s); a trailing '*' is a prefix wildcard. */
  on: string | string[];
  groupId: string;
  /** 0..1, default 1 — probabilistic firing. */
  chance?: number;
  /** Per-rule debounce. */
  minIntervalMs?: number;
  conditions?: Condition[];
}

export interface Candidate {
  ruleId: string;
  groupId: string;
  category: string;
  priority: EventPriority;
  event: AppEvent;
}

const MINUTE = 60_000;

/**
 * Names as they arrive on `process.started`/`process.stopped` payloads: the
 * watchlist entry, trimmed and lower-cased by `ProcessMonitor` — not the raw
 * OS process name. Keep these in sync with `DEFAULT_WATCHED_PROCESSES`.
 */
const GAME_LAUNCHER_NAMES = [
  'steam.exe',
  'epicgameslauncher.exe',
  'battle.net.exe',
  'riotclientservices.exe',
  'galaxyclient.exe',
  'eadesktop.exe'
];

const NOTABLE_APP_NAMES = [
  'spotify.exe',
  'discord.exe',
  'obs64.exe',
  'blender.exe',
  'docker desktop.exe',
  'photoshop.exe',
  'ms-teams.exe',
  'zoom.exe'
];

const GAME_NAMES = [
  'dota2.exe',
  'cs2.exe',
  'valorant-win64-shipping.exe',
  'leagueclientux.exe',
  'gta5.exe',
  'mindustry.exe',
  'factorygamesteam.exe',
  'civilizationvi.exe',
  'risk of rain 2.exe',
  'terraria.exe'
];

const SITUATIONAL_PROCESS_NAMES = [...GAME_LAUNCHER_NAMES, ...NOTABLE_APP_NAMES, ...GAME_NAMES];

/**
 * `chance` is what keeps ambient reactions from feeling mechanical — the
 * companion should read as having noticed, not as having polled.
 */
export const TRIGGER_RULES: TriggerRule[] = [
  // ---- session -----------------------------------------------------
  { id: 'startup', on: 'session.startup', groupId: 'greeting.startup' },
  { id: 'resume', on: 'session.resume', groupId: 'greeting.return', chance: 0.8 },
  {
    id: 'idle.exit.long',
    on: 'session.idle.exit',
    groupId: 'greeting.return',
    conditions: [{ kind: 'payloadNumber', path: 'awayMs', gt: 30 * MINUTE }]
  },
  {
    id: 'idle.exit.short',
    on: 'session.idle.exit',
    groupId: 'greeting.return',
    chance: 0.4,
    conditions: [{ kind: 'payloadNumber', path: 'awayMs', lt: 30 * MINUTE }]
  },
  { id: 'idle.enter', on: 'session.idle.enter', groupId: 'idle.enter', chance: 0.4 },
  { id: 'lock', on: 'session.lock', groupId: 'session.lock', chance: 0.35 },
  { id: 'unlock', on: 'session.unlock', groupId: 'greeting.return', chance: 0.5 },

  // ---- system ------------------------------------------------------
  { id: 'cpu.high', on: 'system.cpu.high', groupId: 'system.cpu', chance: 0.5 },
  { id: 'cpu.sustained', on: 'system.cpu.sustained', groupId: 'system.cpu' },
  { id: 'memory.high', on: 'system.memory.high', groupId: 'system.memory', chance: 0.7 },
  { id: 'temperature.high', on: 'system.temperature.high', groupId: 'system.thermal' },
  { id: 'disk.low', on: 'system.disk.low', groupId: 'system.disk' },
  { id: 'battery.low', on: 'system.battery.low', groupId: 'system.battery' },

  // ---- processes ---------------------------------------------------
  {
    id: 'process.started',
    on: 'process.started',
    groupId: 'process.started',
    chance: 0.35,
    minIntervalMs: 10 * MINUTE,
    conditions: [{ kind: 'payloadString', path: 'name', noneOf: SITUATIONAL_PROCESS_NAMES }]
  },
  {
    id: 'process.stopped',
    on: 'process.stopped',
    groupId: 'process.stopped',
    chance: 0.35,
    minIntervalMs: 10 * MINUTE,
    conditions: [{ kind: 'payloadString', path: 'name', noneOf: SITUATIONAL_PROCESS_NAMES }]
  },
  {
    id: 'process.started.gameLauncher',
    on: 'process.started',
    groupId: 'process.started.gameLauncher',
    chance: 0.4,
    minIntervalMs: 10 * MINUTE,
    conditions: [{ kind: 'payloadString', path: 'name', oneOf: GAME_LAUNCHER_NAMES }]
  },
  {
    id: 'process.started.notable',
    on: 'process.started',
    groupId: 'process.started.notable',
    chance: 0.4,
    minIntervalMs: 10 * MINUTE,
    conditions: [{ kind: 'payloadString', path: 'name', oneOf: NOTABLE_APP_NAMES }]
  },
  {
    id: 'process.started.game',
    on: 'process.started',
    groupId: 'process.started.game',
    chance: 0.4,
    minIntervalMs: 10 * MINUTE,
    conditions: [{ kind: 'payloadString', path: 'name', oneOf: GAME_NAMES }]
  },
  {
    id: 'process.stopped.gameLauncher',
    on: 'process.stopped',
    groupId: 'process.stopped.gameLauncher',
    chance: 0.4,
    minIntervalMs: 10 * MINUTE,
    conditions: [{ kind: 'payloadString', path: 'name', oneOf: GAME_LAUNCHER_NAMES }]
  },
  {
    id: 'process.stopped.notable',
    on: 'process.stopped',
    groupId: 'process.stopped.notable',
    chance: 0.4,
    minIntervalMs: 10 * MINUTE,
    conditions: [{ kind: 'payloadString', path: 'name', oneOf: NOTABLE_APP_NAMES }]
  },
  {
    id: 'process.stopped.game',
    on: 'process.stopped',
    groupId: 'process.stopped.game',
    chance: 0.4,
    minIntervalMs: 10 * MINUTE,
    conditions: [{ kind: 'payloadString', path: 'name', oneOf: GAME_NAMES }]
  },
  { id: 'process.longRunning', on: 'process.longRunning', groupId: 'process.longRunning', chance: 0.6 },

  // ---- schedule ----------------------------------------------------
  { id: 'schedule.morning', on: 'schedule.morning', groupId: 'time.morning' },
  { id: 'schedule.evening', on: 'schedule.evening', groupId: 'time.evening' },
  { id: 'schedule.night', on: 'schedule.night', groupId: 'time.night' },
  { id: 'schedule.hourly', on: 'schedule.hourly', groupId: 'time.hourly', chance: 0.25 },
  { id: 'schedule.workBreak', on: 'schedule.workBreak', groupId: 'wellbeing.break' },
  { id: 'schedule.uptime', on: 'schedule.uptimeMilestone', groupId: 'wellbeing.uptime' },
  // No `chance`: the monitor's silence timer is already the gate, and rolling
  // dice on top would turn "occasionally" into "almost never".
  { id: 'schedule.quiet', on: 'schedule.quiet', groupId: 'chatter.idle' },

  // ---- files -------------------------------------------------------
  {
    id: 'file.download',
    on: 'file.downloadComplete',
    groupId: 'file.download',
    chance: 0.6,
    minIntervalMs: 5 * MINUTE
  },
  { id: 'file.build', on: 'file.buildComplete', groupId: 'file.build' }
];

export interface TriggerEngineOptions {
  rules?: TriggerRule[];
  rng?: Rng;
}

export class TriggerEngine {
  private readonly rules: TriggerRule[];
  private readonly rng: Rng;
  private readonly lastFiredAt = new Map<string, number>();

  constructor(
    private readonly bank: PhraseBankIndex,
    options: TriggerEngineOptions = {}
  ) {
    this.rules = options.rules ?? TRIGGER_RULES;
    this.rng = options.rng ?? Math.random;
  }

  /** Rules pointing at a group the bank does not define. Checked at startup. */
  danglingRules(): { ruleId: string; groupId: string }[] {
    return this.rules
      .filter((rule) => this.bank.group(rule.groupId) === undefined)
      .map((rule) => ({ ruleId: rule.id, groupId: rule.groupId }));
  }

  match(event: AppEvent, ctx: Omit<ConditionContext, 'payload' | 'now'>): Candidate[] {
    const candidates: Candidate[] = [];

    for (const rule of this.rules) {
      const patterns = Array.isArray(rule.on) ? rule.on : [rule.on];
      if (!patterns.some((pattern) => eventTypeMatches(pattern, event.type))) continue;

      if (rule.minIntervalMs !== undefined) {
        const last = this.lastFiredAt.get(rule.id);
        if (last !== undefined && event.at - last < rule.minIntervalMs) continue;
      }

      const conditionCtx: ConditionContext = { ...ctx, now: event.at, payload: event.payload };
      if (!evaluateConditions(rule.conditions, conditionCtx)) continue;

      if (rule.chance !== undefined && rule.chance < 1 && this.rng() >= rule.chance) continue;

      const group = this.bank.group(rule.groupId);
      if (!group) continue;

      this.lastFiredAt.set(rule.id, event.at);
      candidates.push({
        ruleId: rule.id,
        groupId: group.id,
        category: group.category,
        priority: event.priority,
        event
      });
    }

    return candidates;
  }
}
