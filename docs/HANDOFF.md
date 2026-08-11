# Will Hill: Player One — Handoff

Live: https://prodbykctw-max.github.io/will-hill-player-one-game/
Repo: https://github.com/prodbykctw-max/will-hill-player-one-game

Read `docs/GDD.md` for design and `CLAUDE.md` for architecture first. This
file covers what a fresh session needs that isn't obvious from the code.

---

## Background depth: SOLVED — multiplane cards (EAV done, 3 stages to go)

EAV is cut into 10 individually-isolated items plus a base plate, each drawn
at its own rate. `tools/cut_planes.py` does the cutting, `src/render/
backdrop.js` drives it, `src/world/stages.js` holds the depths. The other
three stages have not been cut yet and fall back to the old flat plate
automatically.

**What the client actually wanted**, arrived at over a long back-and-forth
and worth not re-litigating:

- **Discrete items, not bands.** "Isolate the top of the Citgo separately,
  the billboard separately, the entire fence separately." Horizontal bands
  were explicitly rejected. The item list is: tree, Citgo, billboard, fence,
  street lights, McDonald's sign, cars, skyline, shrubs, verge — everything,
  so each detail is independently controllable (glow one bulb, sway one
  shrub).
- **Cardboard stacking.** "Like how the South Park characters were layered —
  cardboard pieces on top of one another." Every card is whole; nothing has a
  bite out of it.
- **SUBTLE.** This is the one that took longest to land. "Like those images
  that look 3D when you shift angle — subtle parallax where the image is not
  getting distorted." A wide rate spread does not read as depth, it reads as
  the set falling over.
- **Items stay put.** "The tree from the beginning of the stage is moving to
  the whole other side of the stage — items should stay where they are but
  float in front of the thing behind them."

**Three earlier attempts were rejected; the reasons are all still valid:**
`split_layers.py` cut boxes (slices through objects), `cut_objects.py` traced
one ellipse by hand (a drawn curve never lands on the real edge),
`cut_layers.py` used disjoint planes with rectangle priority (worked, but the
rectangle boundaries read as hard cuts).

**What made it work this time:**

- **The edge comes from the art, per pixel — a polygon is only a region of
  interest.** The sky is flood-filled once from the frame border, which lands
  on every silhouette in the plate at once. Where two items meet and there is
  no sky between them, a *scoped* colour reject separates them (the Citgo's
  red fascia and black soffit sit above the fence planks). GrabCut is
  available per item for a final snap onto the true boundary.
- **Rates cluster tightly around the plate's 0.10.** `DEPTH_SPREAD = 0.010`,
  with a `MAX_SEPARATION` clamp. Wide spreads and independent wrap phases are
  what made the tree migrate across the stage. At 0.010 the tree stays within
  ~77px of home across the whole 7680px level.
- **Each card is full-frame RGBA**, so the cutout is already in position and
  the renderer needs no placement maths. Mostly-transparent WebP is cheap —
  all 10 cards together are ~330 kB.
- **The base plate is inpainted and then deliberately sunk** (blurred and
  darkened, ramped by distance from the cut edge). 70% of the plate is hole,
  so there is nothing real to reconstruct; a sharp fill only produced ghosts.
- **Sway moved from plate-relative `windBands` to per-card `sway`.** A plant
  card shears on its own pivot and cannot wobble the architecture next to it.
- **Lights carry a `layer`** naming the card they are bolted to, so a glow
  travels with the thing that emits it.

**Verify with `python3 tools/preview_planes.py eav`** before touching the
renderer. It prints a recompose check — base + every card at zero offset must
reproduce the original plate (currently 0.088% of pixels over threshold) —
and writes a 4-position parallax strip. `tools/cut_planes.py eav --debug
--proof` writes the assignment map and the traced outlines; the assignment map
is the one to read, since it shows where the trace actually landed rather than
where the ROI was drawn.

**Cutting the remaining three stages** means adding a `PLANES[<id>]` entry and
a `bg.cards` list. Expect to re-measure the colour rules: `is_sky`,
`is_pale_neutral` and friends carry thresholds sampled from EAV's palette, and
Edgewood/L5P/Underground are lit very differently.

---

## Known-open issues

- ~~**Will Hill "stands at an angle."**~~ FIXED. He was built from AutoSprite's
  `iso_*_right` kinds — an isometric 3/4 projection — so standing still, his
  rear foot floated above the pavement: in that projection the far foot sits
  higher in frame because it is further back in 3D. No renderer offset could
  fix it; sinking the sprite just buried the planted foot. Replaced with a
  **v1 SIDESCROLLER export** (idle/walk/run/jump, true flat side profile,
  facing screen-right). Both feet now land on the same line.
- **Enemy sprites are still front-facing** rather than profile. Same root
  cause, not yet regenerated — and note the enemies and Will Hill's walk were
  explicitly signed off as looking right, so do not "fix" them casually.
- **No roll/hit/death clips** for the pixel Will Hill; they borrow idle/run
  (marked TODO in `tools/compose_player_sheet.py`). `hit` now actually gets
  used — a pothole trip plays it — so this is more visible than it was.
- **The raw sprite export is not in the repo.** `assets/` is git-ignored by
  design, so `tools/compose_player_sheet.py` cannot be re-run from a fresh
  clone without the four source sheets. They came from the user as
  `Will_Hill_Pixel{idle,walk,run,jump}v1.png`, 2560x2560, and must be dropped
  into `assets/raw-sprites/will-hill-pixel/<clip>/spritesheet.png` first.

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
