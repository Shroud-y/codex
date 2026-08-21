/// <reference types="vite/client" />

import type {
  DebugSnapshot,
  PresetAssetKind,
  PresetAssetResult,
  PresetAssetStatus,
  Settings,
  SpeechShowPayload,
  StatePayload
} from '@shared/types';

/**
 * Structural mirrors of the two preload surfaces. Declared rather than
 * imported so the renderer's TS project never pulls in Electron types.
 */
export interface CodexOverlayApi {
  onSpeechShow(handler: (payload: SpeechShowPayload) => void): () => void;
  onSpeechHide(handler: () => void): () => void;
  onSpeechInterrupt(handler: () => void): () => void;
  onStateUpdate(handler: (payload: StatePayload) => void): () => void;
  setInteractive(interactive: boolean): void;
  speechFinished(speechId: string): void;
  speechDismissed(speechId: string): void;
}

export interface CodexPanelApi {
  getSettings(): Promise<Settings>;
  setSettings(patch: Partial<Settings>): Promise<Settings>;
  onSettingsUpdated(handler: (settings: Settings) => void): () => void;
  getDebugSnapshot(): Promise<DebugSnapshot>;
  onDebugSnapshot(handler: (snapshot: DebugSnapshot) => void): () => void;
  fireEvent(type: string): void;
  pickPresetAsset(presetId: string, kind: PresetAssetKind): Promise<PresetAssetResult>;
  clearPresetAsset(presetId: string, kind: PresetAssetKind): Promise<PresetAssetResult>;
  getPresetAssetStatus(presetId: string): Promise<PresetAssetStatus>;
  deletePreset(presetId: string): Promise<PresetAssetResult>;
}

declare global {
  interface Window {
    codex?: CodexOverlayApi;
    codexPanel?: CodexPanelApi;
  }
}
