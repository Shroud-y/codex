import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '@shared/ipc';
import type { DebugSnapshot, Settings } from '@shared/types';

/** Surface for the two ordinary windows: settings and the debug panel. */
const api = {
  getSettings(): Promise<Settings> {
    return ipcRenderer.invoke(IPC.settingsGet) as Promise<Settings>;
  },

  setSettings(patch: Partial<Settings>): Promise<Settings> {
    return ipcRenderer.invoke(IPC.settingsSet, patch) as Promise<Settings>;
  },

  onSettingsUpdated(handler: (settings: Settings) => void): () => void {
    const listener = (_event: unknown, payload: Settings): void => handler(payload);
    ipcRenderer.on(IPC.settingsUpdated, listener);
    return () => ipcRenderer.off(IPC.settingsUpdated, listener);
  },

  getDebugSnapshot(): Promise<DebugSnapshot> {
    return ipcRenderer.invoke(IPC.debugRequestSnapshot) as Promise<DebugSnapshot>;
  },

  onDebugSnapshot(handler: (snapshot: DebugSnapshot) => void): () => void {
    const listener = (_event: unknown, payload: DebugSnapshot): void => handler(payload);
    ipcRenderer.on(IPC.debugSnapshot, listener);
    return () => ipcRenderer.off(IPC.debugSnapshot, listener);
  },

  fireEvent(type: string): void {
    ipcRenderer.send(IPC.debugFireEvent, { type: String(type) });
  }
};

export type CodexPanelApi = typeof api;

contextBridge.exposeInMainWorld('codexPanel', api);
