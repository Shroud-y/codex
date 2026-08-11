import { contextBridge, ipcRenderer } from 'electron';
import type { DebugSnapshot, Settings } from '@shared/types';

/**
 * Surface for the two ordinary windows: settings and the debug panel.
 * Channel names are inlined for the same reason as in `index.ts` — a shared
 * value import becomes a separate chunk that a sandboxed preload cannot load.
 */
const CHANNEL = {
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  settingsUpdated: 'settings:updated',
  debugSnapshot: 'debug:snapshot',
  debugRequestSnapshot: 'debug:requestSnapshot',
  debugFireEvent: 'debug:fireEvent'
} as const;

const api = {
  getSettings(): Promise<Settings> {
    return ipcRenderer.invoke(CHANNEL.settingsGet) as Promise<Settings>;
  },

  setSettings(patch: Partial<Settings>): Promise<Settings> {
    return ipcRenderer.invoke(CHANNEL.settingsSet, patch) as Promise<Settings>;
  },

  onSettingsUpdated(handler: (settings: Settings) => void): () => void {
    const listener = (_event: unknown, payload: Settings): void => handler(payload);
    ipcRenderer.on(CHANNEL.settingsUpdated, listener);
    return () => ipcRenderer.off(CHANNEL.settingsUpdated, listener);
  },

  getDebugSnapshot(): Promise<DebugSnapshot> {
    return ipcRenderer.invoke(CHANNEL.debugRequestSnapshot) as Promise<DebugSnapshot>;
  },

  onDebugSnapshot(handler: (snapshot: DebugSnapshot) => void): () => void {
    const listener = (_event: unknown, payload: DebugSnapshot): void => handler(payload);
    ipcRenderer.on(CHANNEL.debugSnapshot, listener);
    return () => ipcRenderer.off(CHANNEL.debugSnapshot, listener);
  },

  fireEvent(type: string): void {
    ipcRenderer.send(CHANNEL.debugFireEvent, { type: String(type) });
  }
};

export type CodexPanelApi = typeof api;

contextBridge.exposeInMainWorld('codexPanel', api);
