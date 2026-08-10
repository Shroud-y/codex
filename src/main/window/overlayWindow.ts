import { BrowserWindow, screen } from 'electron';
import { join } from 'node:path';
import { IPC } from '@shared/ipc';
import type { SpeechShowPayload, StatePayload } from '@shared/types';
import type { OverlayPresenter } from '../core/speechDirector';
import { createLogger } from '../log/logger';
import { ClickThroughController } from './clickThrough';
import { OVERLAY_HEIGHT, OVERLAY_WIDTH, positionOverlay } from './positioning';
import { loadPage } from './rendererUrl';

const log = createLogger('overlay');

/** Long enough for the 180 ms exit animation to finish before the window goes. */
const EXIT_ANIMATION_MS = 260;

export class OverlayWindow implements OverlayPresenter {
  private win: BrowserWindow | null = null;
  private clickThrough: ClickThroughController | null = null;
  private hideTimer: NodeJS.Timeout | null = null;
  private offsets = { offsetX: 0, offsetY: 0 };
  private ready = false;
  private pending: SpeechShowPayload | null = null;

  create(preloadPath: string): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win;

    // Created once at startup and never destroyed — creating a transparent
    // window on demand causes a visible white flash on Windows (§10).
    const win = new BrowserWindow({
      width: OVERLAY_WIDTH,
      height: OVERLAY_HEIGHT,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      // Without this the overlay steals focus from games and text fields.
      focusable: false,
      hasShadow: false,
      show: false,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false
      }
    });

    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setIgnoreMouseEvents(true, { forward: true });
    win.setMenuBarVisibility(false);

    win.webContents.on('did-finish-load', () => {
      this.ready = true;
      if (this.pending) {
        const payload = this.pending;
        this.pending = null;
        this.show(payload);
      }
    });

    // Nothing in the overlay may navigate or open windows.
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event) => event.preventDefault());

    this.win = win;
    this.clickThrough = new ClickThroughController(win);

    void loadPage(win, 'index').catch((err) => log.error(`failed to load overlay: ${String(err)}`));

    screen.on('display-metrics-changed', () => this.reposition());
    screen.on('display-removed', () => this.reposition());

    return win;
  }

  get browserWindow(): BrowserWindow | null {
    return this.win && !this.win.isDestroyed() ? this.win : null;
  }

  setOffsets(offsets: { offsetX: number; offsetY: number }): void {
    this.offsets = offsets;
    if (this.browserWindow?.isVisible()) this.reposition();
  }

  setInteractive(interactive: boolean): void {
    this.clickThrough?.request(interactive);
  }

  sendState(state: StatePayload): void {
    this.browserWindow?.webContents.send(IPC.stateUpdate, state);
  }

  /* --------------------------- OverlayPresenter --------------------- */

  show(payload: SpeechShowPayload): void {
    const win = this.browserWindow;
    if (!win) return;
    if (!this.ready) {
      this.pending = payload;
      return;
    }

    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }

    if (!win.isVisible()) {
      positionOverlay(win, this.offsets);
      // Never `show()` — that would take focus.
      win.showInactive();
      win.setAlwaysOnTop(true, 'screen-saver');
    }
    win.webContents.send(IPC.speechShow, payload);
  }

  hide(): void {
    const win = this.browserWindow;
    if (!win) return;
    win.webContents.send(IPC.speechHide);
    this.scheduleWindowHide(EXIT_ANIMATION_MS);
  }

  interrupt(): void {
    const win = this.browserWindow;
    if (!win) return;
    win.webContents.send(IPC.speechInterrupt);
  }

  /* ------------------------------------------------------------------ */

  private scheduleWindowHide(delayMs: number): void {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null;
      const win = this.browserWindow;
      if (!win) return;
      win.hide();
      this.clickThrough?.reset();
    }, delayMs);
    this.hideTimer.unref?.();
  }

  private reposition(): void {
    const win = this.browserWindow;
    if (!win) return;
    positionOverlay(win, this.offsets);
  }

  static preloadPath(): string {
    return join(__dirname, '../preload/index.js');
  }
}
