# Will Hill: Player One — Handoff

Live: https://prodbykctw-max.github.io/will-hill-player-one-game/
Repo: https://github.com/prodbykctw-max/will-hill-player-one-game

Read `docs/GDD.md` for design and `CLAUDE.md` for architecture first. This
file covers what a fresh session needs that isn't obvious from the code.

**Every number in this file was verified against the code on 2026-08-11.**
It has been wrong before — a stale line here sent a session off regenerating
enemy sprites that were already fine, and cost the client time correcting it.
If you change a behaviour, change the line here in the same commit. A doc that
is 90% right is worse than no doc, because nobody knows which 90%.

---

## Names

**prodbyKCTW** — the developer. One token: lowercase `prodby`, uppercase
`KCTW`, an acronym for **K**nowledge **C**hange **T**he **W**orld. It does not
come apart into "KC TW". Legal name Melvin D. Brown III, which belongs on
paperwork, not on screen.

**Will Hill** — the artist the game stars, and the player character. Not the
developer.

**Rare Agency** — prodbyKCTW's agency, co-founded with Kema. Will Hill is a
client. prodbyKCTW is credited as Lead Developer. *(Spelling of the agency
name taken from speech and not yet confirmed.)*

---

## The one finding that caused three separate bugs

**Every AutoSprite clip holds more cycles than it looks like.** Measured by
autocorrelation, not assumed:

| clip | contains | true cycle |
|---|---|---|
| idle | 3 breaths | 32 frames |
| walk | 5.6 strides | 17 frames |
| run | 9.6 strides | 10 frames |
| jump | 7 separate hops | ~6 frames |

Sampling evenly across a whole 96-frame clip therefore plays *every one of
those cycles per loop*. That produced, in order: an idle breathing 168 times a
minute, a jump that flailed between grounded and airborne poses, and a walk
running 4.2 strides a second that read as running in place.

**Take ONE cycle from each and time it to a real cadence.** No amount of
slowing playback fixes it, because the frames themselves span the wrong
distance. If you import any new clip, measure its period first —
`tools/compose_player_sheet.py` documents how.

---

## Background depth: multiplane cards — ALL FOUR STAGES CUT

| stage | cards | recompose | notes |
|---|---|---|---|
| EAV | 12 | 0.070% | hand-cut; SAM added only the clouds |
| Edgewood | 14 | 0.079% | richest signage of the four |
| L5P | 16 | 0.083% | least headroom left |
| Underground | 15 | 0.027% | most depth, most headroom |

`tools/sam_segment.py` finds the items, `tools/sam_group.py` folds them into
cards, `tools/cut_planes.py` cuts, `src/render/backdrop.js` draws,
`src/world/stages.js` holds the depths. See
`.claude/skills/backdrop-multiplane/SKILL.md` for the whole process.

**What the client wanted**, arrived at over a long back-and-forth — worth not
re-litigating:

- **Discrete items, not bands.** Horizontal bands were explicitly rejected.
  Everything gets its own card so each detail is independently controllable.
- **Cardboard stacking**, like South Park. Every card is whole.
- **SUBTLE.** "Like those images that look 3D when you shift angle." A wide
  rate spread does not read as depth, it reads as the set falling over.
- **Items stay put.** They float in front of what is behind them; they do not
  migrate across the stage.

**Three earlier attempts were rejected and the reasons still hold:**
`split_layers.py` cut boxes (slices through objects), `cut_objects.py` traced
an ellipse by hand (a drawn curve never lands on the real edge),
`cut_layers.py` used disjoint rectangular planes (worked, read as hard cuts).

**What made it work:**

- **The edge comes from the art, per pixel.** A polygon is only a region of
  interest. The sky is flood-filled once from the frame border, landing on
  every silhouette at once. Where two items meet with no sky between them, a
  *scoped* colour reject separates them. GrabCut is available per item.
- **Rates cluster tightly around the plate's 0.10.** `DEPTH_SPREAD = 0.010`
  with a `MAX_SEPARATION` clamp. Wide spreads plus independent wrap phases are
  what made the tree migrate a whole plate width across a stage.
- **Each card is full-frame RGBA**, so the cutout is already in position.
- **The base plate is inpainted then deliberately sunk.** 70% of it is hole,
  so there is nothing real to reconstruct; a sharp fill produced ghosts.
- **Sway is per-card**, not plate-relative. A plant shears on its own pivot
  and cannot wobble the architecture beside it.
- **Lights carry a `layer`** naming the card they are bolted to.

- **Ground strips are the one exception to the tight spread.** The verge,
  kerb, street and pavement cards carry an explicit `rate: 0.30` and a 400px
  clamp instead of the depth-derived rate. MAX_SEPARATION exists to stop a
  DISCRETE object migrating; a featureless full-width band has no landmark in
  it to notice having moved, and running it ahead of the buildings is what
  separates the street from the backdrop.

**Verify before touching the renderer:** `python3 tools/preview_planes.py <id>`
prints a recompose check — base + every card at zero offset must reproduce the
original plate — and writes a 4-position parallax strip. Under 0.1% is the bar.
`tools/cut_planes.py <id> --debug` writes the assignment map, which is the one
to read: it shows where the trace actually landed, not where the ROI was drawn.
LOOK AT IT BEFORE WIRING. Two Underground cards were cut and wired as solid
rectangles because that step got skipped.

**Detail cards buy GLOW, not depth.** The L5P lettering, the Edgewood neons,
the Underground marquee — a sign flush against a wall has no gap between it
and the wall, so it cannot read as parallax. Each sits a hundredth of depth
from its parent so it cannot visibly slide, and exists so it can be lit on its
own later.

---

## Player feel — current numbers

Animation timing is per-clip, in the atlas (`ticks` per frame). Fractional
values are deliberate: they let a clip gain frames without changing duration.

| clip | frames | ticks | duration | notes |
|---|---|---|---|---|
| idle | 32 | 7.5 | 4.00s | one breath, ~15/min |
| walk | 17 | 3.85 | 1.09s | one stride, ~55/min, 1.47m |
| run | 10 | 3.0 | 0.50s | one stride, ~120/min, 2.28m |
| jump | 6 | — | — | **driven** — posed from `vy`, never ticked |

`advanceAnim` returns early for driven clips. Do not "fix" the jump back to a
timer; that is what made it flail.

- **Two gears.** `WALK_SPEED = 1.9` (1.36 m/s, a real walking pace),
  `RUN_SPEED = 6.4`. Holding a direction walks first and winds up into a run
  only if you keep holding, so a tap is always a walk. `main.js` scales the
  animation rate by actual speed so the feet do not skate between gears.
  **The wind-up is 11 + 10 = 21 ticks**, halved from 42 because the old figure
  was getting the player killed: a step lands every ~33 ticks, so full speed
  used to arrive after the second footfall and most of the way to the third.
  He now hits 90% of run speed at tick 21, before the second step comes down —
  61% more ground covered in the first 0.7s. Do not raise it back without
  playing the game; 42 read as unresponsive to the client immediately.
- **Ground contact is ONE number**: `PLANT_DEPTH = 5.33` in `world/scale.js`.
  It cannot be a flat constant per sprite, because the two projections
  disagree about what their lowest pixel means — an isometric sheet anchors on
  the midpoint between its feet and gets extra sink for free, a side profile
  anchors on its lowest pixel and gets none. The renderer measures what each
  sheet's anchor already gives and tops up the difference, so everyone lands
  identically. `lighting.js` imports the same constant; it used to be a
  hand-copied duplicate and had already drifted, 2 against 3.
- **Air control**: `AIR_ACCEL_MUL = 0.55`, `AIR_DRAG_MUL = 0.06`. Ground
  `DECEL` is 0.62 and snappy on purpose; applying it airborne meant releasing
  the run key for an instant mid-jump shed 6.4 to 0.02 in six ticks and
  dropped you short.
- **Three-touch damage.** An enemy knocks your money loose, a pothole does
  not, so the sequence needs no hit counter: touch one costs cash and a heart,
  touch two a heart, touch three kills. Dropped bags arc out with physics and
  are recoverable after 750ms. See `docs/GDD.md` for the full table.
- **Pothole vs enemy is carried by the motion**, since there is no dedicated
  hit clip: a pothole pitches you forward and locks steering 26 ticks; an
  enemy knocks you backward with no lock.

---

## Audio

Four samples ship (~29 kB total); everything else is synthesised at runtime,
and every sound falls back to synthesis if its sample has not decoded.

| sound | source |
|---|---|
| stomp ×2 | **prodbyKCTW's own voice** + a synthesised body, solved per take to 30% low-frequency |
| coin | Kenney `confirmation_003` (CC0) |
| glisten | Kenney `confirmation_002` (CC0) |

`tools/make_sfx.py` rebuilds all four. Kenney's packs are re-fetched
automatically; the voice memo is committed at `assets/sfx-src/`.

Kenney's own `impactPunch_*` files were tried and rejected — measured at
84–94% low-frequency energy, they are thuds and read as a kick drum. Full
reasoning in `src/assets/audio/CREDITS.md`.

The AudioContext is suspended until a real gesture; `main.js` unlocks it on
the first keydown/pointerdown.

---

## Still open

- **No roll/hit/death clips** for Will Hill; those keys borrow other rows.
  `hit` is now visible (a pothole trip plays it), so it matters more than it
  did.
- **End-credits sequence** is planned but not built. Needs the Rare Agency
  logo and prodbyKCTW's logo — neither asset is in the repo.
- **Four Will Hill tracks**, one per stage, planned. Will need streaming per
  stage rather than up-front loading, and a duck on the music when the punch
  fires.
- **Leaderboard Worker is written but not deployed** — the KV namespace does
  not exist. Deliberately a manual step.

## Settled — do not "fix" these

- **The enemies are fine.** Their WALK clip is a clean side profile in every
  variant. Only the IDLE pose is front-facing, and `enemy.js` sets
  `anim = |vx| > 0 ? 'walk' : 'idle'` — patrolling enemies never stop, so
  those frames never render. An earlier version of this doc claimed otherwise
  and it was simply wrong.
- **Will Hill's floating foot is fixed.** He was on `iso_*_right` (isometric
  3/4), where the far foot is drawn higher because it is further back in 3D.
  Replaced with the v1 SIDESCROLLER export, true side profile.
- **`assets/` is no longer blanket-ignored.** Irreplaceable sources are
  committed — the voice memo and the four sprite sheets. Re-downloadable packs
  and build scratch stay ignored. The rule is: if losing it means the work
  cannot be rebuilt, it goes in.

## ⚠️ Generated animation: the DOUBLE-BODY trap

**Read this before generating any clip where the character changes posture** —
dying, falling, collapsing, being knocked down, lying down, getting up.

AutoSprite animates by generating a short VIDEO and slicing it into frames.
Ask it for "he collapses to the ground" and the video model very often answers
by drawing BOTH STATES AT ONCE: the character standing, and a second copy of
the same character already lying dead beside him. Every frame, both bodies.

**This shipped.** The enemy `defeat` clip has been in the game with a corpse
welded into all 16 frames since the sheets were made — so a stomped enemy
appeared to stand over its own body. The client spotted it by eye; it went
unnoticed here for weeks.

**Why the obvious check misses it.** Counting connected components returns
`bodies=1`, because the standing figure's feet touch the lying figure and the
two merge into one blob. Do NOT trust a component count.

**What actually catches it — bounding-box WIDTH.** A side-profile human is
tall and narrow. Measured on this project:

| clip | bbox | verdict |
|---|---|---|
| good recoil (one body) | 148 x 227 | narrow, correct |
| enemy defeat (two bodies) | 180 x 225 | too wide for one figure |
| player death v1 (two bodies) | 212 x 218 | nearly square — a clear tell |

If width approaches height on a standing side-profile clip, look at the frame.

**How to prevent it.** Say it flatly and repeatedly in the prompt, and name
the failure rather than describing the goal:

> EXACTLY ONE person visible in every frame. Never two figures. Never a
> duplicate, copy or clone. Do NOT draw a body already lying on the ground.

That wording fixed both clips on the first retry.

**Two other failure modes seen in the same batch:**
- **Dissolve.** A clip can evaporate at the end — the first knockback ran
  10813px at frame 18 down to 137px at frame 23. Check pixel count per frame;
  anything under ~3000 is a dead frame. Add "never fades, never dissolves,
  stays fully inside the frame".
- **Multi-cycle.** Every LOOPING clip holds more cycles than it looks like
  (see the table at the top of this file). Pass `loop: false` for one-shots
  and always measure the period before wiring.

**Silver lining, recorded because it is now a real feature:** the bug is what
gave the client the game-over idea. An enemy standing over a body doing a
stomping motion was exactly the image he wanted — enemies walking over to
stomp you out when they kill you, before the fade to Game Over. The fix is not
to keep the buggy asset (the body is welded into the same frame and cannot be
positioned) but to generate the two halves separately: a player `death` lying
pose and an enemy `attack` stomp with empty ground in front of it.

---

## Gotchas that cost real time

- **rAF is suspended when the preview pane isn't composited.** The canvas goes
  black and looks exactly like a rendering bug. Use `?pump=1` (timer shim in
  `core/loop.js`) and `POST /__capture?name=x` to drive and capture headlessly.
- **The dev server dies between tool calls.** Start it with `setsid` and poll
  until it answers, rather than assuming it survived.
- **Chromium cannot reach the internet directly** in this container — outbound
  goes through `$HTTPS_PROXY`. `curl` honours it; Playwright needs it passed
  explicitly.
- **`getbbox()` counts any non-zero alpha.** Background removal leaves
  near-transparent rows BELOW the feet, which became the measured baseline and
  made every character hover. `compose_common.py` thresholds at alpha 40.
- **A home-screen install caches `index.html` indefinitely.** Every asset is
  content-hashed and safe, but the HTML is not — a shipped fix looked like it
  had not shipped. `index.html` now sends no-cache; an already-cached install
  still needs removing and re-adding once.
- **GitHub Pages lags several minutes** behind a deploy, and its CDN caches
  10 minutes on top. Check `gh-pages` content before assuming a deploy failed.
- **Renaming a config key** (`wind` → `windBands`) silently missed one stage.
  Grep every stage after a rename.
- **The image generator reaches for real brands unprompted** — the champagne
  bottle came back with a real trademark. Check any regenerated prop.
- **Deploy only via `bash tools/deploy.sh`.** It builds the commit in a
  throwaway dir containing only `dist/`, so source cannot leak onto the public
  branch.

## Verification recipe

```bash
setsid npx vite --port 5199 --strictPort &   # then open /?pump=1
```

Drive with dispatched KeyboardEvents, `POST /__capture?name=foo` to write a PNG
to `tools/captures/`, then read it. Prefer **measurement over eyeballing** —
frame-differencing settled the tree sway, autocorrelation settled the walk, and
offline audio rendering settled the punch. Every time this project guessed
instead of measuring, it guessed wrong.

Portrait targets: ground line **65%** of screen height, character ~10% of it.
