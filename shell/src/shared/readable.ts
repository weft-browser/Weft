// "Save page as text": the readable part of a page as Markdown, without a model and without a
// dependency. The walker is typed against the few DOM members it needs, so it runs in the page's
// preload on the live document and in tests on a hand-built tree; nothing here imports the DOM.

export interface RNode {
  nodeType: number;
  nodeName: string;
  textContent: string | null;
  childNodes: ArrayLike<RNode>;
  getAttribute?(name: string): string | null;
}

export type Block =
  | { k: 'h'; level: number; text: string }
  | { k: 'p'; text: string }
  | { k: 'li'; text: string; ordered: boolean; depth: number; n: number }
  | { k: 'quote'; text: string }
  | { k: 'code'; text: string }
  | { k: 'table'; rows: string[][] }
  | { k: 'hr' };

export interface WalkOpts { base: string; hidden?: (el: RNode) => boolean; }

const TEXT = 3, ELEM = 1;
const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'NAV', 'FOOTER', 'ASIDE', 'FORM', 'BUTTON', 'SVG', 'svg', 'IFRAME', 'SELECT', 'INPUT', 'TEXTAREA', 'CANVAS', 'VIDEO', 'AUDIO', 'DIALOG', 'MENU', 'IMG', 'PICTURE', 'OBJECT', 'EMBED']);
const INLINE = new Set(['A', 'B', 'STRONG', 'I', 'EM', 'CODE', 'SPAN', 'SMALL', 'SUB', 'SUP', 'MARK', 'ABBR', 'TIME', 'BR', 'Q', 'S', 'U', 'KBD', 'LABEL', 'CITE', 'DFN', 'VAR', 'SAMP', 'DEL', 'INS', 'FONT', 'BDI', 'BDO', 'DATA', 'WBR']);
const LANDMARK = new Set(['ARTICLE', 'MAIN']);
const MIN_ROOT_TEXT = 200;

const kids = (n: RNode): RNode[] => Array.from(n.childNodes);
const tag = (n: RNode): string => n.nodeName.toUpperCase();
const attr = (n: RNode, a: string): string | null => (n.getAttribute ? n.getAttribute(a) : null);
const squash = (s: string): string => s.replace(/[\s ]+/g, ' ');

function skipped(n: RNode, o: WalkOpts): boolean {
  if (n.nodeType !== ELEM) return false;
  if (SKIP.has(n.nodeName) || SKIP.has(tag(n))) return true;
  if (attr(n, 'aria-hidden') === 'true' || attr(n, 'hidden') !== null) return true;
  const role = attr(n, 'role');
  if (role === 'navigation' || role === 'banner' || role === 'contentinfo' || role === 'complementary') return true;
  return !!o.hidden && o.hidden(n);
}

function href(raw: string | null, base: string): string {
  if (!raw) return '';
  try { const u = new URL(raw, base); return /^https?:$/.test(u.protocol) ? u.href : ''; } catch { return ''; }
}

/** Inline code that may itself hold backticks: fence it with one more backtick than its longest run (CommonMark). */
export function codeSpan(s: string): string {
  const run = Math.max(0, ...(s.match(/`+/g) ?? []).map((m) => m.length));
  const fence = '`'.repeat(run + 1);
  return run ? fence + ' ' + s + ' ' + fence : fence + s + fence;
}

/** Inline Markdown for a run of nodes: links, emphasis and code kept, whitespace collapsed. */
function inline(nodes: RNode[], o: WalkOpts): string {
  let out = '';
  for (const n of nodes) {
    if (n.nodeType === TEXT) { out += squash(n.textContent ?? ''); continue; }
    if (n.nodeType !== ELEM || skipped(n, o)) continue;
    const t = tag(n);
    if (t === 'BR') { out += '  \n'; continue; }
    const body = inline(kids(n), o);
    if (!body.trim()) continue;
    const pad = (mark: string): string => { const m = /^(\s*)(.*?)(\s*)$/s.exec(body)!; return m[1] + mark + m[2] + mark + m[3]; };
    if (t === 'A') { const h = href(attr(n, 'href'), o.base); out += h ? '[' + body.trim() + '](' + h + ')' : body; }
    else if (t === 'B' || t === 'STRONG') out += pad('**');
    else if (t === 'I' || t === 'EM') out += pad('*');
    else if (t === 'CODE' || t === 'KBD' || t === 'SAMP') out += codeSpan(body.trim());
    else out += body;
  }
  return out;
}

const clean = (s: string): string => s.split('\n').map((l) => l.replace(/^ +/, '')).join('\n').trim();

function textLen(n: RNode, o: WalkOpts): number {
  if (n.nodeType === TEXT) return squash(n.textContent ?? '').trim().length;
  if (n.nodeType !== ELEM || skipped(n, o)) return 0;
  return kids(n).reduce((s, c) => s + textLen(c, o), 0);
}

/** Where the content is: the largest <article>/<main>, else the element whose direct paragraphs hold the most text, else the body. */
export function findRoot(body: RNode, o: WalkOpts): RNode {
  let land: RNode | null = null, landLen = 0, best: RNode | null = null, bestLen = 0;
  const visit = (n: RNode): void => {
    if (n.nodeType !== ELEM || skipped(n, o)) return;
    const t = tag(n);
    if (LANDMARK.has(t) || attr(n, 'role') === 'main') { const l = textLen(n, o); if (l > landLen) { land = n; landLen = l; } }
    const p = kids(n).filter((c) => c.nodeType === ELEM && tag(c) === 'P').reduce((s, c) => s + textLen(c, o), 0);
    if (p > bestLen) { best = n; bestLen = p; }
    kids(n).forEach(visit);
  };
  visit(body);
  if (land && landLen >= MIN_ROOT_TEXT) return land;
  if (best && bestLen >= MIN_ROOT_TEXT) return best;
  return body;
}

function list(n: RNode, ordered: boolean, depth: number, o: WalkOpts, out: Block[]): void {
  let i = 0;
  for (const li of kids(n)) {
    if (li.nodeType !== ELEM || tag(li) !== 'LI' || skipped(li, o)) continue;
    i += 1;
    const own = kids(li).filter((c) => !(c.nodeType === ELEM && (tag(c) === 'UL' || tag(c) === 'OL')));
    const text = clean(inline(own.flatMap((c) => (c.nodeType === ELEM && !INLINE.has(tag(c)) ? kids(c) : [c])), o));
    if (text) out.push({ k: 'li', text, ordered, depth, n: i });
    kids(li).forEach((c) => { if (c.nodeType === ELEM && (tag(c) === 'UL' || tag(c) === 'OL')) list(c, tag(c) === 'OL', depth + 1, o, out); });
  }
}

function table(n: RNode, o: WalkOpts): string[][] {
  const rows: string[][] = [];
  const visit = (x: RNode): void => {
    if (x.nodeType !== ELEM || skipped(x, o)) return;
    if (tag(x) === 'TR') { const cells = kids(x).filter((c) => c.nodeType === ELEM && (tag(c) === 'TD' || tag(c) === 'TH')).map((c) => clean(inline(kids(c), o)).replace(/\|/g, '\\|').replace(/\n/g, ' ')); if (cells.some(Boolean)) rows.push(cells); return; }
    kids(x).forEach(visit);
  };
  visit(n);
  return rows;
}

/** The blocks under `root`, in reading order. Text between block elements becomes its own paragraph. */
export function walk(root: RNode, o: WalkOpts): Block[] {
  const out: Block[] = [];
  const blocks = (n: RNode): void => {
    let run: RNode[] = [];
    const flush = (): void => { const text = clean(inline(run, o)); if (text) out.push({ k: 'p', text }); run = []; };
    for (const c of kids(n)) {
      if (c.nodeType === TEXT || (c.nodeType === ELEM && INLINE.has(tag(c)))) { run.push(c); continue; }
      if (c.nodeType !== ELEM || skipped(c, o)) continue;
      flush();
      const t = tag(c);
      const h = /^H([1-6])$/.exec(t);
      if (h) { const text = clean(inline(kids(c), o)).replace(/\n/g, ' '); if (text) out.push({ k: 'h', level: Number(h[1]), text }); }
      else if (t === 'P') { const text = clean(inline(kids(c), o)); if (text) out.push({ k: 'p', text }); }
      else if (t === 'UL' || t === 'OL') list(c, t === 'OL', 0, o, out);
      else if (t === 'PRE') { const text = (c.textContent ?? '').replace(/\s+$/, ''); if (text.trim()) out.push({ k: 'code', text }); }
      else if (t === 'BLOCKQUOTE') { const text = clean(inline(kids(c).flatMap((x) => (x.nodeType === ELEM && !INLINE.has(tag(x)) ? [...kids(x), { nodeType: ELEM, nodeName: 'BR', textContent: '', childNodes: [] }] : [x])), o)); if (text) out.push({ k: 'quote', text }); }
      else if (t === 'HR') out.push({ k: 'hr' });
      else if (t === 'TABLE') { const rows = table(c, o); if (rows.length) out.push({ k: 'table', rows }); }
      else blocks(c);
    }
    flush();
  };
  blocks(root);
  return out;
}

export interface PageMeta { title: string; url: string; saved: string; workspace: string; }

/** A Markdown file: YAML front matter (title, source, when, which workspace), then the blocks. */
export function toMarkdown(meta: PageMeta, blocks: Block[]): string {
  const q = (s: string): string => JSON.stringify(s);
  const lines = ['---', 'title: ' + q(meta.title), 'source: ' + q(meta.url), 'saved: ' + meta.saved, 'workspace: ' + q(meta.workspace), '---', ''];
  const body: string[] = [];
  const hasH1 = blocks.some((b) => b.k === 'h' && b.level === 1);
  if (!hasH1 && meta.title) body.push('# ' + meta.title);
  let prevLi = false;
  for (const b of blocks) {
    const li = b.k === 'li';
    if (body.length && !(li && prevLi)) body.push('');
    prevLi = li;
    if (b.k === 'h') body.push('#'.repeat(b.level) + ' ' + b.text);
    else if (b.k === 'p') body.push(b.text);
    else if (b.k === 'li') body.push('  '.repeat(b.depth) + (b.ordered ? b.n + '. ' : '- ') + b.text.replace(/\n/g, '\n' + '  '.repeat(b.depth + 1)));
    else if (b.k === 'quote') body.push(b.text.split('\n').map((l) => '> ' + l.trim()).join('\n'));
    else if (b.k === 'code') { const fence = b.text.includes('```') ? '~~~' : '```'; body.push(fence, b.text, fence); }
    else if (b.k === 'hr') body.push('---');
    else if (b.k === 'table') {
      const w = Math.max(...b.rows.map((r) => r.length));
      const row = (r: string[]): string => '| ' + Array.from({ length: w }, (_, i) => r[i] ?? '').join(' | ') + ' |';
      body.push(row(b.rows[0]!), '|' + ' --- |'.repeat(w), ...b.rows.slice(1).map(row));
    }
  }
  return lines.concat(body).join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

/** A file name for the page: its title, safe on every filesystem, capped, `.md`. */
export function fileName(title: string, url: string): string {
  const base = (title || url.replace(/^[a-z]+:\/\//i, '')).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80).trim();
  return (base || 'page') + '.md';
}
