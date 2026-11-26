import type { JSX } from 'react';
import type { Icon } from '../shared/model';
import { iconPath } from '../shared/model';

export function Glyph({ d, size = 16, stroke = 2 }: { d: string; size?: number; stroke?: number }): JSX.Element {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export const G = {
  plus: 'M12 5v14M5 12h14',
  close: 'M6 6l12 12M18 6L6 18',
  back: 'M15 18l-6-6 6-6',
  fwd: 'M9 18l6-6-6-6',
  reload: 'M20 11a8 8 0 1 0-2.3 5.7 M20 4v7h-7',
  shield: 'M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z',
  globe: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18 M3 12h18 M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18',
  pin: 'M9 4h6l-1 6 4 4H6l4-4-1-6z M12 14v6',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
  eyeOff: 'M3 3l18 18 M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 9 4.5 10 6-.5.8-1.6 2.3-3.2 3.6 M6.5 6.6C4.4 8 2.9 10 2 12c1 1.5 5 6 10 6 1.6 0 3-.4 4.3-1 M9.9 9.9a3 3 0 0 0 4.2 4.2',
  chevron: 'M6 9l6 6 6-6'
};

/** A workspace or tab icon: a letter, a stroke glyph from the library, or an imported image. */
export function IconView({ icon, letter, size = 16, imgSize = 26 }: { icon: Icon | null | undefined; letter: string; size?: number; imgSize?: number }): JSX.Element {
  if (icon?.kind === 'svg') return <Glyph d={iconPath(icon.id)} size={size} />;
  if (icon?.kind === 'img') return <img src={icon.src} alt="" style={{ width: imgSize, height: imgSize, objectFit: 'cover', borderRadius: 5 }} />;
  return <>{letter}</>;
}
