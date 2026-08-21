import { app } from 'electron';
import { join } from 'node:path';

/**
 * Resource lookup differs between `electron-vite dev` (repo layout) and a
 * packaged build (electron-builder `extraResources`).
 */
function resourceRoot(): string {
  return app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources');
}

export const paths = {
  phraseBank: (): string => join(resourceRoot(), 'phrases', 'bank.json'),
  audioDir: (): string => join(resourceRoot(), 'audio'),
  cueDir: (): string => join(resourceRoot(), 'audio', 'cues'),
  iconsDir: (): string => join(resourceRoot(), 'icons'),
  probeDir: (): string => join(resourceRoot(), 'probe'),
  settingsFile: (): string => join(app.getPath('userData'), 'settings.json'),
  stateFile: (): string => join(app.getPath('userData'), 'state.json'),
  logDir: (): string => join(app.getPath('userData'), 'logs'),

  presetsRoot: (): string => join(app.getPath('userData'), 'presets'),
  presetDir: (id: string): string => join(paths.presetsRoot(), id),
  presetBankFile: (id: string): string => join(paths.presetDir(id), 'bank.json'),
  presetGifFile: (id: string): string => join(paths.presetDir(id), 'appearance.gif')
};
