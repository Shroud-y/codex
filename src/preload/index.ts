import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '@shared/ipc';
import type { SpeechShowPayload, StatePayload } from '@shared/types';

/**
 * §12 — the overlay's entire surface. Nothing else is exposed: no node, no
 * fs, no arbitrary ipc.
 */
const api = {
  onSpeechShow(handler: (payload: SpeechShowPayload) => void): () => void {
    const listener = (_event: unknown, payload: SpeechShowPayload): void => handler(payload);
    ipcRenderer.on(IPC.speechShow, listener);
    return () => ipcRenderer.off(IPC.speechShow, listener);
  },

  onSpeechHide(handler: () => void): () => void {
    const listener = (): void => handler();
    ipcRenderer.on(IPC.speechHide, listener);
    return () => ipcRenderer.off(IPC.speechHide, listener);
  },

  onSpeechInterrupt(handler: () => void): () => void {
    const listener = (): void => handler();
    ipcRenderer.on(IPC.speechInterrupt, listener);
    return () => ipcRenderer.off(IPC.speechInterrupt, listener);
  },

  onStateUpdate(handler: (payload: StatePayload) => void): () => void {
    const listener = (_event: unknown, payload: StatePayload): void => handler(payload);
    ipcRenderer.on(IPC.stateUpdate, listener);
    return () => ipcRenderer.off(IPC.stateUpdate, listener);
  },

  setInteractive(interactive: boolean): void {
    ipcRenderer.send(IPC.overlaySetInteractive, Boolean(interactive));
  },

  speechFinished(speechId: string): void {
    ipcRenderer.send(IPC.speechFinished, { speechId: String(speechId) });
  },

  speechDismissed(speechId: string): void {
    ipcRenderer.send(IPC.speechDismissed, { speechId: String(speechId) });
  }
};

export type CodexOverlayApi = typeof api;

contextBridge.exposeInMainWorld('codex', api);
