# Weft shell

The interface and the model of Weft: the React shell (rail, tab strip, toolbar, panels, palette,
HUD) and the pure TypeScript underneath it (workspaces, tabs, environments, the file formats, the
keymap, tab triage). The Chromium fork in [`../chromium`](../chromium/) bundles this into
`chrome://weft`, where it runs as the browser's interface and drives pages through the engine.

Nothing here knows which engine it runs on. That is deliberate (see `AGENTS.md`), and it is why
everything in `src/shared` is unit-tested without a browser.

## Work on it

```sh
npm install
npm run dev      # the shell in your browser, on a fake engine: http://localhost:5173
npm run check    # TypeScript: the model, the shell, and the fork's controller against both
npm test         # vitest
npm run build    # bundle the shell exactly as the fork does, into out/shell/
```

Node 24, any OS.

**`npm run dev`** runs the real shell and the real controller in an ordinary browser tab, with
`dev/fake-engine.ts` standing in for the browser process. Tabs, workspaces, panels, the palette,
the prefix key and Tidy all work, and state is kept in the tab's `localStorage`. No page is
loaded and nothing is enforced (no proxy, no blocking, no extensions): where a page would be you
see the shell's backdrop. `weftDev.log` in the console lists every message the shell sent the
engine. `npm run dev:smoke -- http://localhost:5173/` drives it in headless Chrome.

To see the shell in the real browser you need a Chromium build:
[`../chromium/README.md`](../chromium/README.md).

## Keys

Press `` ` `` (or Ctrl+Space) then one of the keys below. `⌥⌘W` opens the command palette from
anywhere, shell or page, without the prefix.

| Workspaces | | Tabs | | Page | |
|---|---|---|---|---|---|
| `1–9` | jump to | `h` `l` | prev / next | `:` | command palette |
| `j` `k` | next / prev | `t` | new tab | `o` | address / search |
| `n` | new | `T` | new private tab | `f` | follow link (`⇧` new tab · `⌥` private) |
| `d` | new disposable | `x` | close tab | `[` `]` | back / forward |
| `v` | environment | `u` | reopen closed | `+` `-` `0` | zoom page |
| `e` | rename | `a` | all tabs list | `z` | interface size |
| `X` | close | `P` | pin / unpin | `r` | reload |
| | | `g` | new group | `p` | privacy |
| | | `G` | collapse group | `b` | pin sidebar |
| | | `m` | tab menu | `s` | save page as text |
| | | `c` | tidy: tabs to close | | |

In the palette and the all-tabs list: `↑` `↓` or `⌃N` `⌃P` move, `Home` `End` and `PageUp`
`PageDown` jump, `Enter` runs, `Esc` closes; `⌘⌫` in the tabs list closes the selected tab.

**Tab triage** works from local signals only, with no page content and no model (`src/shared/triage.ts`):
when each tab was last in front, its total time in front (one stretch counts for at most 30 min,
and nothing counts while the window is hidden). Sound and typed text are signals the model
understands but the engine does not report yet. In the all-tabs list, `⌃I` orders by
importance and says why under each tab; the palette's *Sort tabs by importance* reorders the strip
(pins keep their order, a group moves with its most important tab). `` ` c `` opens **Tidy**: empty
tabs, duplicates, search results unused for an hour, tabs not opened in 3 days, and tabs opened a
day ago but in front for under 30 s, each with its reason. Nothing closes until you press `⌘⌫` or
`⌘↩` (all); `` ` u `` reopens. The current tab, pins, tabs playing sound or holding typed text and
private tabs are never suggested.

**Save page as text** (`` ` s ``, *not wired to the engine yet*) writes the page's readable part as Markdown (title, source URL,
time and workspace in front matter), to a place you choose in the Save sheet. The reader
(`src/shared/readable.ts`) keeps headings, paragraphs, links,
emphasis, lists, quotes, code and tables, and drops navigation, footers, sidebars, scripts and
anything hidden.

Right-click is a second layer: workspaces in the rail, the `+` button, back/forward (this tab's
history), the shield, the environment chip, and links inside pages. `⇧`-click / `⌘`-click a link
for a new tab, `⌥`-click for a new private tab.

## How it is put together

- `src/shared/` — pure: `model.ts` and its mutations (`ops.ts`), the environment file
  (`envfile.ts`), the saved state (`snapshot.ts`), the keymap (`keys.ts`), the command and event
  protocol (`ipc.ts`), tab triage (`triage.ts`), the page reader (`readable.ts`), the tracker list
  (`trackers.ts`), WireGuard config parsing (`wg.ts`), Web Store package parsing (`crx.ts`).
- `src/renderer/` — the React shell. It holds UI-only state; the browser model arrives as `state`
  events and changes only through commands sent over `window.weft` (`api.ts`).
- `../chromium/shell/` — the other half: `controller.ts` owns the model at runtime and calls the
  engine; `bridge.ts` provides `window.weft`.
- `test/` — vitest. `fixtures/` holds one file per historical on-disk shape; never delete one.
