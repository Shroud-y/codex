import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { PhraseSegment } from '@shared/types';
import type { Condition } from './conditions';

/* ------------------------------------------------------------------ */
/* Schema (§6.1)                                                       */
/* ------------------------------------------------------------------ */

const segmentSchema = z.object({
  text: z.string().min(1),
  mode: z.enum(['normal', 'rage', 'whisper'])
});

const conditionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('timeOfDay'),
    from: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    to: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
  }),
  z.object({ kind: z.literal('dayOfWeek'), days: z.array(z.number().int().min(0).max(6)).min(1) }),
  z.object({
    kind: z.literal('payloadNumber'),
    path: z.string().min(1),
    gt: z.number().optional(),
    lt: z.number().optional()
  }),
  z.object({
    kind: z.literal('payloadString'),
    path: z.string().min(1),
    equals: z.string().optional(),
    oneOf: z.array(z.string()).optional()
  }),
  z.object({ kind: z.literal('uptimeMinutes'), gt: z.number().optional(), lt: z.number().optional() }),
  z.object({ kind: z.literal('firstRun') })
]);

const phraseSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9._-]+$/i, 'must be filename-safe (a-z, 0-9, . _ -)'),
  segments: z.array(segmentSchema).min(1),
  weight: z.number().positive().optional(),
  conditions: z.array(conditionSchema).optional(),
  tags: z.array(z.string()).optional()
});

const groupSchema = z.object({
  id: z.string().min(1),
  category: z.string().min(1),
  phrases: z.array(phraseSchema).min(1)
});

const bankSchema = z.object({
  version: z.literal(1),
  groups: z.array(groupSchema).min(1)
});

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface Phrase {
  id: string;
  segments: PhraseSegment[];
  weight?: number;
  conditions?: Condition[];
  tags?: string[];
}

export interface PhraseGroup {
  id: string;
  /** Cooldown bucket (§8.2). */
  category: string;
  phrases: Phrase[];
}

export interface PhraseBank {
  version: 1;
  groups: PhraseGroup[];
}

export class PhraseBankError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PhraseBankError';
  }
}

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

function describeIssues(error: z.ZodError, raw: unknown): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join('.');
      const offender = offendingId(raw, issue.path);
      const where = offender ? `${path} (entry "${offender}")` : path || '<root>';
      return `  • ${where}: ${issue.message}`;
    })
    .join('\n');
}

/** Walks back up the issue path to the nearest object carrying an `id`. */
function offendingId(raw: unknown, path: readonly PropertyKey[]): string | null {
  let cursor: unknown = raw;
  let found: string | null = null;
  for (const key of path) {
    if (cursor === null || typeof cursor !== 'object') break;
    const next = (cursor as Record<PropertyKey, unknown>)[key];
    if (next !== null && typeof next === 'object' && 'id' in (next as object)) {
      const id = (next as { id?: unknown }).id;
      if (typeof id === 'string') found = id;
    }
    cursor = next;
  }
  return found;
}

/**
 * Validates a raw bank. A schema violation or duplicate id is fatal and the
 * message names the offending entry (§6).
 */
export function parsePhraseBank(raw: unknown, source = 'bank.json'): PhraseBank {
  const result = bankSchema.safeParse(raw);
  if (!result.success) {
    throw new PhraseBankError(
      `Invalid phrase bank (${source}):\n${describeIssues(result.error, raw)}`
    );
  }

  const bank = result.data as PhraseBank;

  // `id` is a contract — it becomes the audio filename. Enforce uniqueness
  // across the whole bank, not just within a group.
  const seenPhrase = new Map<string, string>();
  const seenGroup = new Set<string>();
  for (const group of bank.groups) {
    if (seenGroup.has(group.id)) {
      throw new PhraseBankError(`Invalid phrase bank (${source}): duplicate group id "${group.id}"`);
    }
    seenGroup.add(group.id);

    for (const phrase of group.phrases) {
      const previous = seenPhrase.get(phrase.id);
      if (previous !== undefined) {
        throw new PhraseBankError(
          `Invalid phrase bank (${source}): duplicate phrase id "${phrase.id}" ` +
            `in groups "${previous}" and "${group.id}"`
        );
      }
      seenPhrase.set(phrase.id, group.id);
    }
  }

  return bank;
}

/* ------------------------------------------------------------------ */
/* Index                                                               */
/* ------------------------------------------------------------------ */

export class PhraseBankIndex {
  private readonly groups = new Map<string, PhraseGroup>();
  private readonly phrases = new Map<string, Phrase>();

  constructor(readonly bank: PhraseBank) {
    for (const group of bank.groups) {
      this.groups.set(group.id, group);
      for (const phrase of group.phrases) this.phrases.set(phrase.id, phrase);
    }
  }

  group(groupId: string): PhraseGroup | undefined {
    return this.groups.get(groupId);
  }

  phrase(phraseId: string): Phrase | undefined {
    return this.phrases.get(phraseId);
  }

  groupIds(): string[] {
    return [...this.groups.keys()];
  }

  get phraseCount(): number {
    return this.phrases.size;
  }
}

export function loadPhraseBank(filePath: string): PhraseBankIndex {
  let text: string;
  try {
    text = readFileSync(filePath, 'utf8');
  } catch (err) {
    throw new PhraseBankError(`Cannot read phrase bank at ${filePath}: ${(err as Error).message}`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new PhraseBankError(`Phrase bank at ${filePath} is not valid JSON: ${(err as Error).message}`);
  }

  return new PhraseBankIndex(parsePhraseBank(raw, filePath));
}
