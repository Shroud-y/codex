import { builtinModules } from 'node:module';
import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

import pkg from './package.json';

/**
 * chokidar >=5 is ESM-only. The main bundle is CJS, so it must be bundled in
 * rather than externalized (a `require('chokidar')` would throw at runtime).
 */
const BUNDLED_DEPS = ['chokidar', 'readdirp'];

const NODE_BUILTINS = [
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`)
];

/** Everything Electron resolves at runtime instead of us bundling it. */
const EXTERNAL = [
  'electron',
  ...NODE_BUILTINS,
  ...Object.keys(pkg.dependencies).filter((name) => !BUNDLED_DEPS.includes(name))
];

const cjsOutput = {
  format: 'cjs' as const,
  entryFileNames: '[name].js',
  chunkFileNames: 'chunks/[name].js'
};

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@main': resolve('src/main')
      }
    },
    build: {
      rollupOptions: {
        external: EXTERNAL,
        input: { index: resolve('src/main/index.ts') },
        output: cjsOutput
      }
    }
  },
  preload: {
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    },
    build: {
      rollupOptions: {
        external: EXTERNAL,
        input: {
          index: resolve('src/preload/index.ts'),
          panel: resolve('src/preload/panel.ts')
        },
        // A sandboxed preload must be CommonJS — ESM is not supported there.
        output: cjsOutput
      }
    }
  },
  renderer: {
    root: resolve('src/renderer'),
    plugins: [react()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@renderer': resolve('src/renderer')
      }
    },
    build: {
      rollupOptions: {
        input: {
          overlay: resolve('src/renderer/index.html'),
          debug: resolve('src/renderer/debug.html'),
          settings: resolve('src/renderer/settings.html')
        }
      }
    }
  }
});
