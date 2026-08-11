/** Types that cross the IPC boundary. Keep this file dependency-free. */

export type SpeechMode = 'normal' | 'rage' | 'whisper';

export interface PhraseSegment {
  text: string;
  mode: SpeechMode;
}

/** Geometric glyph shown in the toast's left cell. Drawn in code (§1). */
export type ToastGlyph = 'build' | 'download' | 'disk' | 'clock' | 'alert';

/**
 * §6 — an event carrying a concrete fact, rendered as the only framed element
 * in the overlay.
 *
 * The renderer is ready for a toast that arrives *without* speech, so that a
 * `notable` event can surface during quiet hours or fullscreen suppression
 * without breaking silence. Making that happen needs the speech director to
 * resolve an event to `{ toast }`, `{ speech }` or both, which is a change to
 * working Phase 1 logic and is deliberately not part of this task — main never
 * populates this field yet.
 */
export interface ToastPayload {
  id: string;
  text: string;
  glyph: ToastGlyph;
  /** How long the toast holds before fading, independent of the speech. */
  durationMs: number;
}

/** main → renderer: 'speech:show' */
export interface SpeechShowPayload {
  speechId: string;
  segments: PhraseSegment[];
  durationMs: number;
  /** Present only when a voice engine has audio for this phrase. */
  audioUrl?: string;
  /** Which character is speaking. Absent means the default persona. */
  personaId?: string;
  /** Accompanying toast, if the event carried a concrete fact. */
  toast?: ToastPayload;
}

/**
 * Which body the character is wearing. A persona is *who* is speaking; a skin
 * is *what it looks like*. They are separate axes, so this crosses IPC on its
 * own rather than riding on the persona id.
 */
export type SkinId = 'ovoid' | 'aperture';

export const SKIN_IDS: readonly SkinId[] = ['ovoid', 'aperture'];

/** main → renderer: 'state:update' */
export interface StatePayload {
  muted: boolean;
  snoozedUntil: number | null;
  /** Switchable at runtime from settings; no restart. */
  skinId: SkinId;
}

/** renderer → main: 'speech:finished' / 'speech:dismissed' */
export interface SpeechAckPayload {
  speechId: string;
}

export type FrequencyProfile = 'chatty' | 'balanced' | 'reserved' | 'rare';

export interface QuietHours {
  enabled: boolean;
  /** 'HH:mm' */
  from: string;
  /** 'HH:mm' */
  to: string;
}

export interface OverlaySettings {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface Settings {
  version: 1;
  startWithSystem: boolean;
  /** Overrides the persona's default skin. */
  skinId: SkinId;
  frequencyProfile: FrequencyProfile;
  quietHours: QuietHours;
  suppressOnFullscreen: boolean;
  suppressOnMicrophoneUse: boolean;
  watchedProcesses: string[];
  watchedFolders: string[];
  monitors: Record<string, boolean>;
  overlay: OverlaySettings;
}

/* ------------------------------------------------------------------ */
/* Debug panel                                                         */
/* ------------------------------------------------------------------ */

export interface DebugEvent {
  id: string;
  type: string;
  at: number;
  priority: 'ambient' | 'notable' | 'urgent';
  payload: unknown;
}

export interface DebugCooldown {
  key: string;
  remainingMs: number;
  totalMs: number;
}

export interface DebugSnapshot {
  events: DebugEvent[];
  cooldowns: DebugCooldown[];
  suppression: { suppressed: boolean; reason: string | null; hardMute: boolean };
  deferred: { speechId: string; expiresAt: number }[];
  knownEventTypes: string[];
  frequencyProfile: FrequencyProfile;
}
