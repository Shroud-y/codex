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
export type SkinId = 'eye';

export const SKIN_IDS: readonly SkinId[] = ['eye'];

/**
 * Where the overlay's two cue sounds come from. `null` means no file was
 * found and the renderer synthesises that cue itself.
 *
 * Resolved once at startup, like the voice engine: dropping a file in takes
 * effect on the next launch.
 */
export interface CueSources {
  appear: string | null;
  disappear: string | null;
}

/** main → renderer: 'state:update' */
export interface StatePayload {
  muted: boolean;
  snoozedUntil: number | null;
  /** Switchable at runtime from settings; no restart. */
  skinId: SkinId;
  cues: CueSources;
  /** The active preset's display name, e.g. 'Ordis' or a user's rename. */
  presetName: string;
  /** Set when the active preset has a custom appearance GIF, which replaces the skin entirely. */
  appearanceGifUrl: string | null;
  /** 0 (silent) to 1 (full), from `Settings.overlay.cueVolume`. */
  cueVolume: number;
  appearSoundEnabled: boolean;
  disappearSoundEnabled: boolean;
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
  /** 0 (silent) to 1 (full). Applies to both a file cue and the synthesised fallback. */
  cueVolume: number;
  appearSoundEnabled: boolean;
  disappearSoundEnabled: boolean;
}

/**
 * A switchable character profile. `'codex'` is the built-in Ordis preset —
 * renamable but not deletable. Custom phrase bank, cue sounds and appearance
 * GIF are not stored here: their presence on disk under
 * `userData/presets/<id>/` is what decides whether they override the
 * defaults, the same bargain `resolveCueSources` already makes for the
 * shipped cue sounds.
 */
export interface Preset {
  id: string;
  name: string;
  /** Fallback shader skin, used only when the preset has no appearance GIF. */
  skinId: SkinId;
}

export const BUILTIN_PRESET_ID = 'codex';

/** Which of a preset's overridable assets an operation targets. */
export type PresetAssetKind = 'bank' | 'appearSound' | 'disappearSound' | 'gif';

export type PresetAssetResult = { ok: true } | { ok: false; error: string };

/** Default-vs-custom status per asset, for the Settings panel to render. */
export interface PresetAssetStatus {
  hasBank: boolean;
  hasAppear: boolean;
  hasDisappear: boolean;
  hasGif: boolean;
}

export interface Settings {
  version: 4;
  startWithSystem: boolean;
  presets: Preset[];
  activePresetId: string;
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
