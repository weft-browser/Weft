import { useEffect, useState } from 'react';
import type { Command, Event } from '../shared/ipc';
import type { BrowserState } from '../shared/model';

export const send = (cmd: Command): void => window.weft.send(cmd);

// The newest snapshot, set the moment it arrives. A `ui` event can follow a `state` event before
// React has rendered it (the controller runs in this same process), so a handler that must act on
// what the controller just did reads this, not the state captured by its last render.
let latest: BrowserState | null = null;
export const latestState = (): BrowserState | null => latest;

/** The browser model as the controller publishes it; null until the first snapshot arrives. */
export function useBrowserState(onEvent?: (e: Event) => void): BrowserState | null {
  const [state, setState] = useState<BrowserState | null>(null);
  useEffect(() => {
    let alive = true;
    window.weft.getState().then((s) => { if (alive) { latest = latest ?? s; setState(latest); } });
    const off = window.weft.on((e) => {
      if (e.type === 'state') { latest = e.state; setState(e.state); }
      onEvent?.(e);
    });
    return () => { alive = false; off(); };
    // onEvent is read through a ref by callers that need the latest closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return state;
}
