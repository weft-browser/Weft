// Bundles the Weft shell (the React app in ../shell/src/renderer, reused by path, never
// copied) for chrome://weft. Output names are fixed because the GN resource list is static.
// Run through scripts/build-shell.sh, which supplies the app's node_modules.
import { resolve } from 'node:path';

const HERE = resolve(import.meta.dirname);
const APP = resolve(HERE, '../../shell');
const mod = (name) => resolve(APP, 'node_modules', name);

// A plain object, not defineConfig(): nothing in this folder can resolve 'vite' itself.
export default ({
  root: HERE,
  base: './',
  publicDir: false,
  resolve: {
    alias: { react: mod('react'), 'react-dom': mod('react-dom'), 'smol-toml': mod('smol-toml') }
  },
  esbuild: { jsx: 'automatic' },
  build: {
    outDir: resolve(HERE, '../chromium/src/chrome/browser/resources/weft/dist'),
    emptyOutDir: true,
    target: 'esnext',
    modulePreload: false,
    cssCodeSplit: false,
    sourcemap: false,
    rollupOptions: {
      input: resolve(HERE, 'index.html'),
      output: { entryFileNames: 'shell.js', assetFileNames: '[name][extname]', codeSplitting: false }
    }
  }
});
