# Contributing to Weft

Thanks for helping. Weft is young, so small, well-tested changes land fastest. This applies
equally to people and to the coding agents they run.

## Before you start

1. Read [`AGENTS.md`](./AGENTS.md) (what Weft is, the invariants) and
   [`product.md`](./product.md) (what it is for, and what it refuses to be). A feature that
   contradicts either needs a discussion first, not a pull request.
2. Pick an issue, or open one describing the bug or the change. Assign it to yourself or comment
   that you are taking it. Issues labelled `good first issue` need no background.
3. For anything larger than a fix, say in the issue how you plan to do it and wait for a
   maintainer's nod. It saves you building the wrong thing.

## Set up

```sh
git clone https://github.com/weft-browser/weft.git
cd weft/app
npm install
npm run dev      # the browser, with hot reload for the shell
```

Requirements: macOS 14+ on Apple silicon to run the app, Node 24. Type-checking, tests and the
bundles also run on Linux. The Chromium fork in `chromium/` needs ~100 GB and hours; you do not
need it to work on the app.

## Make the change

```sh
npm run check    # TypeScript, both configs
npm test         # vitest
npm run build && node scripts/drive.mjs scripts/smoke.drive   # drive the built app, no screen needed
```

- New behaviour goes in `app/src/shared/` first, as pure functions with tests, and is then wired
  to the engine in `app/src/main/`. `app/AGENTS.md` explains why.
- Follow [`rules/engineering.md`](./rules/engineering.md): a regression test with every fix, a
  fixture when a stored format changes, keyboard access for every surface, no new network request
  without the data inventory.
- Drive the feature in the built app before you call it done, and say in the pull request what
  you drove.

## Send it

- One pull request per issue, from a branch, with `Fixes #N` in the description.
- Say what changed, how you verified it, and anything you could not verify.
- CI must be green. A maintainer reviews and merges; agents never merge.
- No AI attribution lines in commits or descriptions.

## Using a coding agent

The repository is set up for it: `AGENTS.md` at the root and in each directory (with `CLAUDE.md`
pointing at them), a `plan.md` per area with what is in flight, and a headless driver so an agent
can see the app. Give your agent one clone to itself, one issue, and the instruction to stop at
an open pull request. You are accountable for what it sends.

## Licence

Weft is licensed under the [Mozilla Public License 2.0](./LICENSE). By sending a pull request you
agree that your contribution is licensed under the same terms, and that you have the right to
contribute it. Do not paste in code under a licence that MPL-2.0 cannot include.

The name *Weft* and the Woven W mark belong to Walnut Labs LLC and are not covered by the licence
(MPL-2.0 grants no rights in names or logos): you may build and share your own version of the code, but not call it Weft or ship it
with Weft's icon.
