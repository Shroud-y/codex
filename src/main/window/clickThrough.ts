import type { BrowserWindow } from 'electron';

/** §10.2 — rapid flipping produces input glitches in the app underneath. */
const DEBOUNCE_MS = 50;

export class ClickThroughController {
  private interactive = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly win: BrowserWindow) {
    this.apply(false);
  }

  request(interactive: boolean): void {
    if (interactive === this.interactive) {
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      return;
    }
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.interactive = interactive;
      this.apply(interactive);
    }, DEBOUNCE_MS);
    this.timer.unref?.();
  }

  /** Called on hide so the window never stays grabbing the mouse. */
  reset(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.interactive = false;
    this.apply(false);
  }

  private apply(interactive: boolean): void {
    if (this.win.isDestroyed()) return;
    this.win.setIgnoreMouseEvents(!interactive, { forward: true });
  }
}
