/** Every IPC channel name used in the app. No string literals elsewhere. */

export const IPC = {
  // main → renderer (overlay)
  speechShow: 'speech:show',
  speechHide: 'speech:hide',
  speechInterrupt: 'speech:interrupt',
  stateUpdate: 'state:update',

  // renderer (overlay) → main
  overlaySetInteractive: 'overlay:setInteractive',
  speechFinished: 'speech:finished',
  speechDismissed: 'speech:dismissed',

  // main ↔ debug window
  debugSnapshot: 'debug:snapshot',
  debugRequestSnapshot: 'debug:requestSnapshot',
  debugFireEvent: 'debug:fireEvent',

  // main ↔ settings window
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  settingsUpdated: 'settings:updated'
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
