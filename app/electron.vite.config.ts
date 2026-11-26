import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { lib: { entry: resolve(__dirname, 'src/main/index.ts') } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          tab: resolve(__dirname, 'src/preload/tab.ts')
        }
      }
    }
  },
  renderer: {
    plugins: [
      react(),
      // The React refresh preamble is an inline script; allow it on the dev server only.
      { name: 'dev-csp', apply: 'serve', transformIndexHtml: (html: string) => html.replace("default-src 'self';", "default-src 'self'; script-src 'self' 'unsafe-inline';") }
    ],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          hud: resolve(__dirname, 'src/renderer/hud.html')
        }
      }
    }
  }
});
