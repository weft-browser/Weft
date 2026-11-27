import { describe, expect, it } from 'vitest';
import { fileName, findRoot, toMarkdown, walk, type RNode } from '../src/shared/readable';

// A DOM-shaped tree without a DOM: the walker only needs these members.
type Kid = RNode | string;
const text = (s: string): RNode => ({ nodeType: 3, nodeName: '#text', textContent: s, childNodes: [] });
function h(name: string, attrs: Record<string, string> | Kid = {}, ...kids: Kid[]): RNode {
  if (typeof attrs === 'string' || 'nodeType' in attrs) { kids.unshift(attrs as Kid); attrs = {}; }
  const a = attrs as Record<string, string>;
  const childNodes = kids.map((k) => (typeof k === 'string' ? text(k) : k));
  return { nodeType: 1, nodeName: name.toUpperCase(), childNodes, get textContent() { return childNodes.map((c) => c.textContent ?? '').join(''); }, getAttribute: (n) => (n in a ? a[n]! : null) };
}
const BASE = 'https://blog.example/post/1';
const long = 'Weft keeps every workspace in its own partition, so cookies never cross. '.repeat(4);

describe('finding the content', () => {
  it('prefers the largest article or main over the page chrome', () => {
    const body = h('body', h('nav', h('a', { href: '/' }, 'Home')), h('div', h('p', 'short teaser')), h('article', h('h1', 'The post'), h('p', long)));
    expect(findRoot(body, { base: BASE }).nodeName).toBe('ARTICLE');
  });
  it('falls back to the element whose paragraphs hold the most text, then to the body', () => {
    const story = h('div', { class: 'story' }, h('p', long), h('p', long));
    const body = h('body', h('div', h('p', 'Sidebar blurb')), story);
    expect(findRoot(body, { base: BASE })).toBe(story);
    const tiny = h('body', h('p', 'hi'));
    expect(findRoot(tiny, { base: BASE })).toBe(tiny);
  });
  it('ignores a landmark too small to be the content', () => {
    const story = h('div', h('p', long));
    const body = h('body', h('main', h('p', 'Cookie notice')), story);
    expect(findRoot(body, { base: BASE })).toBe(story);
  });
});

describe('blocks', () => {
  it('keeps headings, paragraphs, links, emphasis, code, lists, quotes, tables and rules', () => {
    const root = h('article',
      h('h1', 'Title'),
      h('p', 'Read ', h('a', { href: '/docs' }, 'the docs'), ' and ', h('strong', 'save '), h('em', 'often'), ', run ', h('code', 'npm test'), '.'),
      h('ul', h('li', 'one'), h('li', 'two', h('ol', h('li', 'nested a'), h('li', 'nested b')))),
      h('blockquote', h('p', 'Quoted line')),
      h('pre', 'const a = 1;\nconst b = 2;\n'),
      h('hr'),
      h('table', h('tr', h('th', 'Key'), h('th', 'Does')), h('tr', h('td', '`'), h('td', 'prefix | leader')))
    );
    expect(walk(root, { base: BASE })).toEqual([
      { k: 'h', level: 1, text: 'Title' },
      { k: 'p', text: 'Read [the docs](https://blog.example/docs) and **save** *often*, run `npm test`.' },
      { k: 'li', text: 'one', ordered: false, depth: 0, n: 1 },
      { k: 'li', text: 'two', ordered: false, depth: 0, n: 2 },
      { k: 'li', text: 'nested a', ordered: true, depth: 1, n: 1 },
      { k: 'li', text: 'nested b', ordered: true, depth: 1, n: 2 },
      { k: 'quote', text: 'Quoted line' },
      { k: 'code', text: 'const a = 1;\nconst b = 2;' },
      { k: 'hr' },
      { k: 'table', rows: [['Key', 'Does'], ['`', 'prefix \\| leader']] }
    ]);
  });
  it('keeps backticks inside inline code, as the prefix key shows up in docs', () => {
    expect(walk(h('p', 'Press ', h('code', '` c'), ' or ', h('kbd', 'a``b')), { base: BASE })).toEqual([{ k: 'p', text: 'Press `` ` c `` or ``` a``b ```' }]);
  });
  it('drops scripts, navigation, hidden and aria-hidden nodes, and unsafe links', () => {
    const root = h('div',
      h('script', 'alert(1)'), h('style', 'p{}'), h('nav', 'Menu'), h('footer', 'Copyright'),
      h('p', { hidden: '' }, 'invisible'), h('p', { 'aria-hidden': 'true' }, 'decor'), h('div', { role: 'navigation' }, 'crumbs'),
      h('p', h('a', { href: 'javascript:alert(1)' }, 'click'), ' and ', h('a', { href: 'mailto:a@b.example' }, 'mail')),
      h('p', { class: 'ad' }, 'hidden by style')
    );
    const hidden = (n: RNode): boolean => n.getAttribute?.('class') === 'ad';
    expect(walk(root, { base: BASE, hidden })).toEqual([{ k: 'p', text: 'click and mail' }]);
  });
  it('turns loose text between blocks into paragraphs and collapses whitespace', () => {
    const root = h('div', '  Intro\n   text ', h('h2', 'Part'), 'tail  ', h('span', 'bit'), h('br'), 'next');
    expect(walk(root, { base: BASE })).toEqual([
      { k: 'p', text: 'Intro text' },
      { k: 'h', level: 2, text: 'Part' },
      { k: 'p', text: 'tail bit  \nnext' }
    ]);
  });
});

describe('markdown file', () => {
  const meta = { title: 'A "quoted" post', url: BASE, saved: '2026-11-25T12:00:00.000Z', workspace: 'Research' };
  it('writes front matter that YAML reads back, a title heading, and tight lists', () => {
    const md = toMarkdown(meta, [{ k: 'p', text: 'Hello' }, { k: 'li', text: 'a', ordered: false, depth: 0, n: 1 }, { k: 'li', text: 'b', ordered: false, depth: 1, n: 1 }, { k: 'code', text: 'x ``` y' }]);
    expect(md).toBe([
      '---', 'title: "A \\"quoted\\" post"', 'source: "' + BASE + '"', 'saved: 2026-11-25T12:00:00.000Z', 'workspace: "Research"', '---', '',
      '# A "quoted" post', '', 'Hello', '', '- a', '  - b', '', '~~~', 'x ``` y', '~~~', ''
    ].join('\n'));
  });
  it('does not repeat the title when the page has its own h1', () => {
    expect(toMarkdown(meta, [{ k: 'h', level: 1, text: 'Own title' }])).not.toContain('# A "quoted" post');
  });
  it('pads short table rows', () => {
    expect(toMarkdown(meta, [{ k: 'table', rows: [['a', 'b'], ['c']] }])).toContain('| a | b |\n| --- | --- |\n| c |  |');
  });
  it('names the file after the title, safe on any filesystem', () => {
    expect(fileName('Hello: a/b "c"?', BASE)).toBe('Hello a b c.md');
    expect(fileName('', 'https://blog.example/x')).toBe('blog.example x.md');
    expect(fileName('x'.repeat(200), BASE)).toHaveLength(83);
  });
});
