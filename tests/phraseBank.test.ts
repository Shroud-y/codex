import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PhraseBankError, PhraseBankIndex, loadPresetBank, parsePhraseBank } from '@main/core/phraseBank';
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

describe('loadPresetBank', () => {
  let dir: string | null = null;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  function overrideFile(groups: unknown[]): string {
    dir = mkdtempSync(join(tmpdir(), 'codex-preset-bank-'));
    const file = join(dir, 'bank.json');
    writeFileSync(file, JSON.stringify(bank(groups)));
    return file;
  }

  const defaultBank = parsePhraseBank(
    bank([
      { id: 'g1', category: 'ambient', phrases: [validPhrase] },
      { id: 'g2', category: 'ambient', phrases: [{ ...validPhrase, id: 'a.two' }] }
    ])
  );

  it('replaces a group by id and leaves the rest of the default bank alone', () => {
    const override = overrideFile([
      { id: 'g1', category: 'ambient', phrases: [{ id: 'a.custom', segments: [{ text: 'Custom.', mode: 'normal' }] }] }
    ]);
    const index = loadPresetBank(defaultBank, override);
    expect(index.group('g1')?.phrases[0]?.id).toBe('a.custom');
    expect(index.group('g2')?.phrases[0]?.id).toBe('a.two');
  });

  it('adds a group the default bank never had', () => {
    const override = overrideFile([
      { id: 'g3', category: 'ambient', phrases: [{ id: 'a.three', segments: [{ text: 'New.', mode: 'normal' }] }] }
    ]);
    const index = loadPresetBank(defaultBank, override);
    expect(index.group('g1')).toBeDefined();
    expect(index.group('g3')?.phrases[0]?.id).toBe('a.three');
  });

  it('rejects an invalid override with the same schema as the shipped bank', () => {
    const override = overrideFile([{ id: 'g1', category: 'ambient', phrases: [] }]);
    expect(() => loadPresetBank(defaultBank, override)).toThrow(PhraseBankError);
  });

  it('throws when the override file does not exist', () => {
    expect(() => loadPresetBank(defaultBank, join(tmpdir(), 'codex-preset-bank-missing.json'))).toThrow(
      PhraseBankError
    );
  });
});
