import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import { moveSel } from '../../shared/listnav';
import type { PaletteItem } from '../palette-items';

export function Palette({ items, query, onQuery, onRun, onClose }: { items: PaletteItem[]; query: string; onQuery: (q: string) => void; onRun: (it: PaletteItem) => void; onClose: () => void }): JSX.Element {
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => { setSel(0); }, [query]);
  const cur = Math.min(sel, Math.max(items.length - 1, 0));
  useEffect(() => { list.current?.querySelector<HTMLElement>('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' }); }, [cur, items.length]);
  return (
    <div role="dialog" aria-label="Command palette" className="palette">
      <div className="pal-head">
        <span aria-hidden="true" className="mono" style={{ fontSize: 14, fontWeight: 600, color: 'var(--key)' }}>&gt;_</span>
        <label htmlFor="palq" className="sr">Command, tab, workspace or address</label>
        <input id="palq" ref={input} type="text" autoComplete="off" spellCheck={false} placeholder="Type a command, tab, workspace or address" value={query}
          aria-activedescendant={items[cur] ? 'pal-' + cur : undefined} aria-controls="pal-list"
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={(e) => {
            const next = moveSel(e.key, e.ctrlKey, cur, items.length);
            if (next !== null) { e.preventDefault(); setSel(next); return; }
            if (e.key === 'Enter') { e.preventDefault(); const it = items[cur]; if (it) onRun(it); }
            else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
          }} />
        <span className="mono" style={{ fontSize: 11, color: 'var(--faint)' }}>esc</span>
      </div>
      <div id="pal-list" ref={list} role="listbox" aria-label="Results" className="pal-list">
        {items.map((it, n) => (
          <button key={it.kind + it.label + n} id={'pal-' + n} type="button" role="option" tabIndex={-1} aria-selected={n === cur} className={'pal-item' + (n === cur ? ' on' : '')} onClick={() => onRun(it)} onMouseEnter={() => setSel(n)}>
            <span aria-hidden="true" className="dot" style={{ background: it.color }} />
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span className="ellip">{it.label}</span>
              <span className="ellip" style={{ fontSize: 12, color: 'var(--muted)' }}>{it.sub}</span>
            </span>
            <span className="pal-kind">{it.kind}</span>
            <span className="mono" style={{ fontSize: 11, color: 'var(--text2)', minWidth: 30, textAlign: 'right' }}>{it.key}</span>
          </button>
        ))}
        {items.length === 0 && <p style={{ margin: 0, padding: '16px 12px', color: 'var(--muted)' }}>No matches</p>}
      </div>
      <div className="pal-foot"><span><b>↑ ↓</b> move</span><span><b>⌃n ⌃p</b> too</span><span><b>enter</b> run</span><span><b>esc</b> close</span></div>
    </div>
  );
}
