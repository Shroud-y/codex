import { describe, expect, it } from 'vitest';
import { PhraseBankIndex, parsePhraseBank } from '@main/core/phraseBank';
import { TriggerEngine, type TriggerRule } from '@main/core/triggerEngine';
import { createEvent, eventTypeMatches } from '@main/core/events';

const bank = new PhraseBankIndex(
  parsePhraseBank({
    version: 1,
    groups: [
      {
        id: 'g.system',
        category: 'system',
        phrases: [{ id: 's.one', segments: [{ text: 'Hot.', mode: 'normal' }] }]
      }
    ]
  })
);

const baseCtx = { uptimeMinutes: 120, firstRun: false };

describe('eventTypeMatches', () => {
  it('matches exact types, prefix wildcards and the catch-all', () => {
    expect(eventTypeMatches('system.cpu.high', 'system.cpu.high')).toBe(true);
    expect(eventTypeMatches('system.cpu.high', 'system.cpu.low')).toBe(false);
    expect(eventTypeMatches('system.*', 'system.cpu.high')).toBe(true);
    expect(eventTypeMatches('system.*', 'process.started')).toBe(false);
    expect(eventTypeMatches('*', 'anything.at.all')).toBe(true);
  });
});

describe('TriggerEngine', () => {
  const rule: TriggerRule = { id: 'r', on: 'system.cpu.high', groupId: 'g.system' };

  it('resolves the group category onto the candidate', () => {
    const engine = new TriggerEngine(bank, { rules: [rule], rng: () => 0 });
    const candidates = engine.match(createEvent('system.cpu.high', 'ambient', {}, 1), baseCtx);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({ ruleId: 'r', groupId: 'g.system', category: 'system' });
  });

  it('ignores events no rule listens for', () => {
    const engine = new TriggerEngine(bank, { rules: [rule], rng: () => 0 });
    expect(engine.match(createEvent('file.buildComplete', 'notable', {}, 1), baseCtx)).toEqual([]);
  });

  it('applies chance using the injected rng', () => {
    const chancy: TriggerRule = { ...rule, chance: 0.5 };
    const always = new TriggerEngine(bank, { rules: [chancy], rng: () => 0.1 });
    const never = new TriggerEngine(bank, { rules: [chancy], rng: () => 0.9 });
    expect(always.match(createEvent('system.cpu.high', 'ambient', {}, 1), baseCtx)).toHaveLength(1);
    expect(never.match(createEvent('system.cpu.high', 'ambient', {}, 1), baseCtx)).toHaveLength(0);
  });

  it('honours minIntervalMs per rule', () => {
    const engine = new TriggerEngine(bank, {
      rules: [{ ...rule, minIntervalMs: 60_000 }],
      rng: () => 0
    });
    expect(engine.match(createEvent('system.cpu.high', 'ambient', {}, 0), baseCtx)).toHaveLength(1);
    expect(engine.match(createEvent('system.cpu.high', 'ambient', {}, 30_000), baseCtx)).toHaveLength(
      0
    );
    expect(engine.match(createEvent('system.cpu.high', 'ambient', {}, 61_000), baseCtx)).toHaveLength(
      1
    );
  });

  it('gates on conditions against the event payload', () => {
    const engine = new TriggerEngine(bank, {
      rules: [{ ...rule, conditions: [{ kind: 'payloadNumber', path: 'load', gt: 90 }] }],
      rng: () => 0
    });
    expect(
      engine.match(createEvent('system.cpu.high', 'ambient', { load: 95 }, 1), baseCtx)
    ).toHaveLength(1);
    expect(
      engine.match(createEvent('system.cpu.high', 'ambient', { load: 50 }, 2), baseCtx)
    ).toHaveLength(0);
  });

  it('reports rules pointing at a missing group', () => {
    const engine = new TriggerEngine(bank, {
      rules: [{ id: 'broken', on: 'x', groupId: 'nope' }],
      rng: () => 0
    });
    expect(engine.danglingRules()).toEqual([{ ruleId: 'broken', groupId: 'nope' }]);
  });

  it('carries the event priority through to the candidate', () => {
    const engine = new TriggerEngine(bank, { rules: [rule], rng: () => 0 });
    const [candidate] = engine.match(createEvent('system.cpu.high', 'urgent', {}, 1), baseCtx);
    expect(candidate?.priority).toBe('urgent');
  });
});
