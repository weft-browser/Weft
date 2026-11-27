import type { WeftApi } from '../shared/ipc';

declare global {
  interface Window { weft: WeftApi; }
}
export {};
