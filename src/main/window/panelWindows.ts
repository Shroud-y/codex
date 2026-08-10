import { BrowserWindow } from 'electron';
import { join } from 'node:path';
import { createLogger } from '../log/logger';
import { loadPage, type RendererPage } from './rendererUrl';

const log = createLogger('panels');

/** Ordinary, focusable windows — the config screen and the debug panel. */
class PanelWindow {
  private win: BrowserWindow | null = null;

  constructor(
    private readonly page: RendererPage,
    private readonly title: string,
    private readonly size: { width: number; height: number }
  ) {}

  get browserWindow(): BrowserWindow | null {
    return this.win && !this.win.isDestroyed() ? this.win : null;
  }

  open(): void {
    const existing = this.browserWindow;
    if (existing) {
      existing.show();
      existing.focus();
      return;
    }

    const win = new BrowserWindow({
      width: this.size.width,
      height: this.size.height,
      title: this.title,
      show: false,
      autoHideMenuBar: true,
      backgroundColor: '#0d1013',
      webPreferences: {
        preload: join(__dirname, '../preload/panel.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });

    win.on('ready-to-show', () => win.show());
    win.on('closed', () => {
      this.win = null;
    });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

    this.win = win;
    void loadPage(win, this.page).catch((err) =>
      log.error(`failed to load ${this.page}: ${String(err)}`)
    );
  }

  send(channel: string, payload: unknown): void {
    this.browserWindow?.webContents.send(channel, payload);
  }

  close(): void {
    this.browserWindow?.close();
  }
}

export const settingsWindow = new PanelWindow('settings', 'Codex — Settings', {
  width: 620,
  height: 720
});

export const debugWindow = new PanelWindow('debug', 'Codex — Debug', {
  width: 980,
  height: 720
});
