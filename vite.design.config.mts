import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * §7 — serves the design harness on its own, with `pnpm design`.
 *
 * The harness uses no Electron API at all, so it does not need the app: this
 * gives it a normal, focusable browser window with working devtools, and
 * avoids launching the tray app (and its monitors) every time the look is
 * being iterated on. `electron-vite dev` also serves `design.html`, for when
 * the real overlay window is what needs looking at.
 */
export default defineConfig({
  root: resolve('src/renderer'),
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@renderer': resolve('src/renderer')
    }
  },
  server: { port: 5199, strictPort: true, open: '/design.html' }
});
