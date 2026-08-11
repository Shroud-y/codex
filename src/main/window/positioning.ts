import { screen, type BrowserWindow, type Display } from 'electron';

/* §3 — the canvas the three zones are laid out inside. Content grows leftward
   and upward within it, so these never change at runtime and the window never
   moves while a phrase is on screen. */
export const OVERLAY_WIDTH = 560;
export const OVERLAY_HEIGHT = 460;

/** §10.1 */
const RIGHT_INSET = 24;
const VERTICAL_OFFSET_RATIO = 0.12;

export interface PositionOffsets {
  offsetX: number;
  offsetY: number;
}

export function computePosition(
  display: Display,
  offsets: PositionOffsets = { offsetX: 0, offsetY: 0 }
): { x: number; y: number } {
  const area = display.workArea;

  let x = area.x + area.width - OVERLAY_WIDTH - RIGHT_INSET + offsets.offsetX;
  let y =
    area.y +
    Math.round(area.height / 2 - OVERLAY_HEIGHT / 2 + area.height * VERTICAL_OFFSET_RATIO) +
    offsets.offsetY;

  // Never land partly offscreen.
  x = Math.max(area.x, Math.min(x, area.x + area.width - OVERLAY_WIDTH));
  y = Math.max(area.y, Math.min(y, area.y + area.height - OVERLAY_HEIGHT));

  return { x, y };
}

/** The display under the cursor, which is where the user is looking. */
export function displayUnderCursor(): Display {
  try {
    return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  } catch {
    return screen.getPrimaryDisplay();
  }
}

export function positionOverlay(win: BrowserWindow, offsets: PositionOffsets): void {
  if (win.isDestroyed()) return;
  const { x, y } = computePosition(displayUnderCursor(), offsets);
  win.setBounds({ x, y, width: OVERLAY_WIDTH, height: OVERLAY_HEIGHT });
}
