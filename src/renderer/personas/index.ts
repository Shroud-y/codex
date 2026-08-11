import { codex } from './codex';
import type { Persona } from './types';

export * from './types';
export { codex };

export const DEFAULT_PERSONA_ID = 'codex';

/**
 * Extension point: a second character is one more entry here plus its own
 * module. Nothing in the components needs to change unless it also introduces
 * a new `ShellForm`.
 */
const REGISTRY: Record<string, Persona> = {
  [codex.id]: codex
};

/** Falls back to the default rather than throwing — a persona id arriving
 *  from a future main process must never leave the overlay blank. */
export function getPersona(id: string | undefined): Persona {
  if (id && REGISTRY[id]) return REGISTRY[id] as Persona;
  return REGISTRY[DEFAULT_PERSONA_ID] as Persona;
}

export function personaIds(): string[] {
  return Object.keys(REGISTRY);
}
