import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PhraseBankError, PhraseBankIndex, parsePhraseBank } from '@main/core/phraseBank';
import { TRIGGER_RULES, TriggerEngine } from '@main/core/triggerEngine';
import { DEFAULT_COOLDOWNS } from '@main/core/cooldown';

const shippedBank = JSON.parse(
  readFileSync(join(process.cwd(), 'resources/phrases/bank.json'), 'utf8')
) as unknown;

function bank(groups: unknown[]): unknown {
  return { version: 1, groups };
}

const validPhrase = { id: 'a.one', segments: [{ text: 'Hello.', mode: 'normal' }] };

describe('parsePhraseBank', () => {
  it('accepts a minimal valid bank', () => {
    const parsed = parsePhraseBank(bank([{ id: 'g', category: 'ambient', phrases: [validPhrase] }]));
    expect(parsed.groups).toHaveLength(1);
  });

  it('rejects a wrong version', () => {
    expect(() =>
      parsePhraseBank({ version: 2, groups: [{ id: 'g', category: 'ambient', phrases: [validPhrase] }] })
    ).toThrow(PhraseBankError);
  });

  it('names the offending entry on a malformed phrase', () => {
    let message = '';
    try {
      parsePhraseBank(
        bank([
          {
            id: 'g',
            category: 'ambient',
            phrases: [validPhrase, { id: 'a.two', segments: [{ text: 'x', mode: 'shouting' }] }]
          }
        ])
      );
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain('a.two');
  });

  it('rejects duplicate phrase ids across different groups', () => {
    expect(() =>
      parsePhraseBank(
        bank([
          { id: 'g1', category: 'ambient', phrases: [validPhrase] },
          { id: 'g2', category: 'system', phrases: [validPhrase] }
        ])
      )
    ).toThrow(/duplicate phrase id "a\.one"/);
  });

  it('rejects duplicate group ids', () => {
    expect(() =>
      parsePhraseBank(
        bank([
          { id: 'g', category: 'ambient', phrases: [validPhrase] },
          { id: 'g', category: 'ambient', phrases: [{ ...validPhrase, id: 'a.two' }] }
        ])
      )
    ).toThrow(/duplicate group id "g"/);
  });

  it('rejects ids that would not be filename-safe', () => {
    expect(() =>
      parsePhraseBank(
        bank([{ id: 'g', category: 'ambient', phrases: [{ ...validPhrase, id: 'bad/id' }] }])
      )
    ).toThrow(PhraseBankError);
  });

  it('rejects an empty group and an empty segment list', () => {
    expect(() => parsePhraseBank(bank([{ id: 'g', category: 'ambient', phrases: [] }]))).toThrow(
      PhraseBankError
    );
    expect(() =>
      parsePhraseBank(bank([{ id: 'g', category: 'ambient', phrases: [{ id: 'x', segments: [] }] }]))
    ).toThrow(PhraseBankError);
  });

  it('rejects an unknown condition kind', () => {
    expect(() =>
      parsePhraseBank(
        bank([
          {
            id: 'g',
            category: 'ambient',
            phrases: [{ ...validPhrase, conditions: [{ kind: 'telepathy' }] }]
          }
        ])
      )
    ).toThrow(PhraseBankError);
  });
});

describe('the shipped bank', () => {
  const parsed = parsePhraseBank(shippedBank, 'resources/phrases/bank.json');
  const index = new PhraseBankIndex(parsed);

  it('ships at least 60 phrases', () => {
    expect(index.phraseCount).toBeGreaterThanOrEqual(60);
  });

  it('uses only known cooldown categories', () => {
    // Derived, not duplicated: a category with no entry here silently falls
    // back to `categoryDefault`, which is the kind of drift a hardcoded list
    // in a test cannot catch.
    const known = new Set(Object.keys(DEFAULT_COOLDOWNS.categories));
    for (const group of parsed.groups) expect(known).toContain(group.category);
  });

  it('keeps glitch phrases to roughly one in five', () => {
    const phrases = parsed.groups.flatMap((group) => group.phrases);
    const glitchy = phrases.filter((phrase) => phrase.segments.some((s) => s.mode === 'rage'));
    const ratio = glitchy.length / phrases.length;
    expect(ratio).toBeGreaterThan(0.1);
    expect(ratio).toBeLessThan(0.33);
  });

  it('has a phrase group behind every trigger rule', () => {
    const engine = new TriggerEngine(index);
    expect(engine.danglingRules()).toEqual([]);
    expect(TRIGGER_RULES.length).toBeGreaterThan(0);
  });
});
