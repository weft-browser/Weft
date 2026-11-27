# Weft shell — Working Plan

Live thread for `shell/`. The backlog is GitHub Issues; the fork's thread is
`../chromium/plan.md`; the repository-wide one is the root `plan.md`.

## Status

- ✅ The shell and the model, engine-neutral, bundled by the fork into `chrome://weft`.
- ✅ Tab triage (2026-11-25): importance order (`⌃I` in the all-tabs list), *Sort tabs by
  importance*, Tidy close suggestions (` c). Local signals only, no model.
- ⏳ Save page as text (` s): the reader (`src/shared/readable.ts`) is written and tested; the
  engine cannot yet run it in a page or show a save dialog, so the command says so.

## Next

1. A dev mode with a fake engine, so the shell runs in an ordinary browser tab and a contributor
   can work on the interface without a Chromium build.
2. Whatever `../chromium/plan.md` needs from the shell as engine features land.

## Decisions

- **Model owned by the controller, view in the shell**: one owner.
- **Nothing here imports an engine.** It ran on Electron until 2026-11-27 and runs on the fork
  now without a change to this directory; keep it that way.

## Open / parked

- Tab triage, later layers: an on-device model for grouping and summaries; a user-chosen
  endpoint, opt-in and declared in the data inventory first. Not before layer 1 proves useful.
- `strict` fingerprint mode implies a fixed UA/screen/fonts profile; scope unclear.
