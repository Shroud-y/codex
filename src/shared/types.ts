/** Types that cross the IPC boundary. Keep this file dependency-free. */

export type SpeechMode = 'normal' | 'rage' | 'whisper';

export interface PhraseSegment {
  text: string;
  mode: SpeechMode;
}

/** main → renderer: 'speech:show' */
export interface SpeechShowPayload {
  speechId: string;
  segments: PhraseSegment[];
  durationMs: number;
  /** Present only when a voice engine has audio for this phrase. */
  audioUrl?: string;
}

/** main → renderer: 'state:update' */
export interface StatePayload {
  muted: boolean;
  snoozedUntil: number | null;
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
