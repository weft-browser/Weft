# AGENTS.md — shell

The React shell and the pure model of Weft. Product context and the invariants are in the root
[`AGENTS.md`](../AGENTS.md); this file covers working in this directory. What is here and how it
fits the fork: [README.md](README.md).

## Layout

- `src/shared/` — **pure** TypeScript: the model and its mutations, the persisted formats, the
  keymap, the command/event protocol, tab triage, the page reader. No DOM, no engine, no React;
  everything is unit-tested headless and `test/seam.test.ts` fails the build if that slips. Put
  new behaviour here first, then wire it.
- `src/renderer/` — the React shell. UI-only state (hover, panels, palette, menus) lives here; the
  browser model arrives as `state` events and changes only through commands.
- `../chromium/shell/controller.ts` — owns the model at runtime and calls the engine. A command
  the engine cannot serve yet answers with a toast saying so, never silence.
- `test/` — vitest. `fixtures/` holds one file per historical on-disk shape; never delete one.

## Build & test

```sh
npm install
npm run check      # tsc: shared + tests, the shell, and ../chromium/shell against both
npm test           # vitest
npm run build      # the bundle the fork packs, written to out/shell/
```

CI runs exactly these. **Driving** a change means a Chromium build
([`../chromium/AGENTS.md`](../chromium/AGENTS.md)): `scripts/drive.mjs` there opens
`chrome://weft` headless and screenshots it. If you cannot build Chromium, say in the pull request
that the change is type-checked and unit-tested but not driven; a maintainer drives it.

## Rules of the road

- **The controller owns the model.** Don't grow a second copy in the shell; if the shell needs a
  fact, put it on the state snapshot. If a command needs a UI reaction (focus the address bar,
  open the palette), the controller replies with a `ui` event rather than the shell guessing.
- **Everything persisted is a contract**: `state.json` (`snapshot.ts`) and `<slug>.env.toml`
  (`envfile.ts`). New fields are optional-with-default on decode; unknown keys are kept or ignored,
  never fatal; a bad record is dropped with a log line, never the whole file. Add a fixture under
  `test/fixtures/` whenever the shape changes.
- **Say only what is enforced.** If the engine cannot apply an option, the UI says so where the
  option is chosen. See the root `AGENTS.md` invariants.
- **Keep the keymap in one place** (`src/shared/keys.ts`); the leader help card and the palette
  both render from it, so a new binding appears everywhere or nowhere.
- **A private tab is never listed or saved.** Anything that lists or saves tabs skips
  `tab.private`.
- Match the file's density: compact TypeScript, no decorative comments, no emoji in code.
