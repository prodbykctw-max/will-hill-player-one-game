# Will Hill: Player One — Handoff

Live: https://prodbykctw-max.github.io/will-hill-player-one-game/
Repo: https://github.com/prodbykctw-max/will-hill-player-one-game

Read `docs/GDD.md` for design and `CLAUDE.md` for architecture first. This
file covers what a fresh session needs that isn't obvious from the code.

---

## The one thing to get right next: background depth layers

**What the client wants, in their words:** as you walk left→right, the Swifty
billboard should slowly disappear *behind* the Citgo building. The whole
fence (Welcome sign included) is one plane. Sky is another. Things at the
same **distance** belong to the same layer — the unit is distance, not
object.

**Two attempts have been made and BOTH were rejected. Do not repeat them:**

1. **Rectangular band crops** (`split_layers.py`, deleted) — cut the image
   into boxes. Slices straight through objects. Rejected: "you took
   sectioning the wrong way."
2. **Per-object cutouts** (`cut_objects.py`, deleted) — traced the Welcome
   sign's ellipse and lifted just that. Rejected: "undo that elliptical
   cutout, it's horrible and not what I asked" — because the unit is
   distance, not individual objects.

A third attempt (`cut_layers.py`, deleted) partitioned the image into
disjoint distance planes with rectangular region priority. **It functionally
worked** — Swifty was visibly swallowed by the Citgo building exactly as
asked — **but was rejected for looking bad**: the rectangular plane
boundaries read as hard visible cuts.

**So the mechanism is proven; the cutting is the problem.** What's needed is
plane boundaries that follow the real edges in the art (roofline, fence top,
tree silhouette) rather than rectangles. Options not yet tried:
- Hand-authored masks per plane (most control, slowest)
- `remove_background` (media MCP) on a crop per plane to get true silhouettes
- Regenerating each stage as separate per-plane art

**Implementation notes that DID work and are worth reusing:**
- Planes must be **disjoint** — every pixel in exactly one plane. Then the
  set reassembles into the original image at rest and nothing needs
  inpainting or erasing.
- Store each plane's position as **fractions** of the source image, so it
  survives re-export at another resolution.
- Draw far→near. A nearer plane with a higher parallax overtakes and
  occludes the ones behind — that occlusion IS the effect being asked for.
- Parallax spread that read well: far 0.03, mid 0.06–0.10, near 0.18,
  foreground 0.34. Base plate runs at 0.10.

---

## Known-open issues

- **Will Hill "stands at an angle."** The pixel sprite is generated from
  AutoSprite's `iso_*_right` kinds, which are an isometric 3/4 view, not a
  pure side profile — the angle is inherent to the source, not a bug in the
  renderer. Fixing it means regenerating with SIDESCROLLER `idle/walk/run/
  jump` kinds, BUT those produced front-facing results for the enemy, so it
  needs a test generation before committing credits.
- **Enemy sprites are front-facing** rather than profile, same root cause.
- **No roll/hit/death clips** for the pixel Will Hill; they borrow idle/run
  (marked TODO in `tools/compose_player_sheet.py`).
- **Trunk sway unverified.** Rain contaminates pixel-diff sampling, so
  "is the trunk moving?" hasn't been cleanly answered.

## Gotchas that cost real time — don't rediscover these

- **rAF is suspended when the preview pane isn't composited.** The canvas
  goes black and it looks exactly like a rendering bug. Use `?pump=1` (timer
  shim in `core/loop.js`) and `POST /__capture?name=x` (vite middleware) to
  drive and capture headlessly.
- **`getbbox()` counts any non-zero alpha.** AutoSprite's background removal
  leaves near-transparent rows BELOW the feet; those became the measured
  baseline and every character hovered. `compose_common.py` now thresholds at
  alpha 40. Re-check this on any new sprite import.
- **Feet on the tile's top edge look wrong.** The sidewalk cap is the
  pavement's top surface in perspective, so its top edge is the FAR side.
  `FOOTPLANT` in `render/renderer.js` sinks the draw onto the pavement;
  `render/lighting.js` has a matching copy — **keep them in step**.
- **`assets/` is gitignored**, so in-place edits there have no history. Back
  up before editing art (an edit to the Edgewood sign was only recoverable
  because `dist/` still held the previous build).
- **Renaming a config key** (`wind` → `windBands`) silently missed one stage
  and the effect looked entirely broken. Grep every stage after a rename.
- **The image generator reaches for real brands unprompted** — the champagne
  bottle came back with a real trademark. Check any regenerated prop.
- **Deploy only via `bash tools/deploy.sh`.** It builds the commit in a
  throwaway dir containing only `dist/`, so source cannot leak onto the
  public branch.

## Verification recipe

```bash
npx vite --port 5199 --strictPort      # then open /?pump=1
```
Drive with dispatched KeyboardEvents, `POST /__capture?name=foo` to write a
PNG to `tools/captures/`, then read it. Prefer **frame-differencing over
eyeballing** for motion questions — that's how the tree sway and the dead
touch pads were actually settled.

Portrait targets: ground line **65%** of screen height, character ~10% of it.
