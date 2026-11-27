import { useEffect, useState } from 'react';
import type { Command, Event } from '../shared/ipc';
import type { BrowserState } from '../shared/model';

export const send = (cmd: Command): void => window.weft.send(cmd);

/** The browser model as main publishes it; null until the first snapshot arrives. */
export function useBrowserState(onEvent?: (e: Event) => void): BrowserState | null {
  const [state, setState] = useState<BrowserState | null>(null);
  useEffect(() => {
    let alive = true;
    window.weft.getState().then((s) => { if (alive) setState(s); });
    const off = window.weft.on((e) => {
      if (e.type === 'state') setState(e.state);
      onEvent?.(e);
    });
    return () => { alive = false; off(); };
    // onEvent is read through a ref by callers that need the latest closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return state;
}
