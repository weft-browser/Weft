// `npm run dev`: serves the shell with a fake engine (dev/fake-engine.ts) on http://localhost:5173.
import { resolve } from 'node:path';

const HERE = resolve(import.meta.dirname);
const SHELL = resolve(HERE, '..');
const mod = (name) => resolve(SHELL, 'node_modules', name);

export default ({
  root: HERE,
  publicDir: false,
  // The fork's entry lives outside this folder, so its bare imports are pointed at our node_modules.
  resolve: { alias: { react: mod('react'), 'react-dom': mod('react-dom'), 'smol-toml': mod('smol-toml') } },
  esbuild: { jsx: 'automatic' },
  server: { port: 5173, strictPort: false, fs: { allow: [resolve(SHELL, '..')] } }
});
