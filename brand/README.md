# Brand — weft

**Name: *Weft*** (2026-11-06): lowercase `weft` as a wordmark, "Weft" in prose and as the app
name. Workspaces run down, tabs run across. Woven, not piled.

**Mark: the Woven W** (chosen on the design canvas, board "Name and logo directions",
2026-11-07): a W drawn as one blue thread, with a light weft thread woven through it: under the
outer strokes, over the middle V. Explorations that led there are on the same canvas
: "Weft mark options" (six
weaves) and "Woven W explorations" (eight Ws). The earlier plain-weave mark, and the PNG sheets in
the earlier brand identity doc that show it,
are superseded; that doc needs regenerating with the Woven W.

| File | What |
|---|---|
| [`weft.svg`](./weft.svg) | the mark on dark, 64-unit grid |
| [`weft-light.svg`](./weft-light.svg) | the mark on light (`#f4f2ee`) |
| [`weft-icon.svg`](./weft-icon.svg) | macOS app icon, 1024 grid: the mark on the navy tile |
| [`weft-icon-small.svg`](./weft-icon-small.svg) | the board's heavier drawing, used for the 16 and 32 px icon sizes |

**One fix against the canvas SVG:** the canvas clips the "over the middle V" overlay to a box that
also catches the outer legs, and the overlay's dark outline and blue redraw share one clip, which
leaves hairline seams. Invisible at 88 px, visible at 1024. These files clip the outline to the
middle V only and the redraw a little taller. Same drawing, no artefacts.

## Colours

| Role | Dark | Light |
|---|---|---|
| warp (the W) | `#6aa9ff` | `#2a63c4` |
| weft (the crossbar) | `#e8eaed` | `#16181d` |
| icon tile | `#14233a` | `#f4f2ee` |
| gap where threads cross | the surface behind the mark | |

## Wordmark

Inter 800, lowercase `weft`, letter-spacing −0.05em. `#e8eaed` on dark, `#16181d` on light.

## Where it is used

Regenerate all of these whenever the mark changes, from `weft-icon.svg` (≥ 64 px) and
`weft-icon-small.svg` (16 and 32 px): `qlmanage -t -s 1024`, then `sips -z` per size, then
`iconutil -c icns`.

- `chromium/brand/app.icns`, `product_logo_1024.png`: the browser.
