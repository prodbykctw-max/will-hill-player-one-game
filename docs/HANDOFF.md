# Will Hill: Player One — Handoff

Live: https://prodbykctw-max.github.io/will-hill-player-one-game/
Repo: https://github.com/prodbykctw-max/will-hill-player-one-game

Read `docs/GDD.md` for design and `CLAUDE.md` for architecture first. This
file covers what a fresh session needs that isn't obvious from the code.

**Every number in this file was verified against the code on 2026-08-12.**
It has been wrong before — a stale line here sent a session off regenerating
enemy sprites that were already fine, and cost the client time correcting it.
If you change a behaviour, change the line here in the same commit. A doc that
is 90% right is worse than no doc, because nobody knows which 90%.

---

## Names

**prodbyKCTW** — the developer. One token: lowercase `prodby`, uppercase
`KCTW`, an acronym for **K**nowledge **C**hanged **T**he **W**orld — PAST TENSE,
read off the logo artwork, which is the authority. It does not
come apart into "KC TW". Legal name Melvin D. Brown III, which belongs on
paperwork, not on screen.

**Will Hill** — the artist the game stars, and the player character. Not the
developer.

**RARƎ AGENCY** — prodbyKCTW's agency, co-founded with Kema. Will Hill is a
client. prodbyKCTW is credited as Lead Developer.

**THE LAST E IS REVERSED. It is always reversed.** The wordmark is `RAR` +
a mirrored E (`Ǝ`, U+018E), which reads at a glance like a 3 — that is the
brand, not a rendering fault, and not something to "fix" to a normal E. Spelt
plainly it is RARE AGENCY; set as the mark it is **RARƎ AGENCY**.

Anywhere the name is DRAWN rather than placed as artwork — the end credits,
a splash, a title — the E must be mirrored. In canvas that means drawing the
final glyph with a horizontal flip (`scale(-1, 1)` about its own centre)
rather than typing an E, because no ordinary font will do it. `Ǝ` exists as a
character but will not match the logo's geometry; the logo file is the
authority whenever it is available.

Spelling confirmed from the logo on 2026-08-11, no longer a guess from
speech. The mark is a light-blue rounded-rectangle border, notched top-right
and bottom-left, with `RARƎ` in near-black, a light-blue arrowhead set inside
the A, and `AGENCY` beneath in widely tracked light blue.

**The logo FILE is not in the repo** — seen in chat only. End credits cannot
ship without it. Note also that one of the three supplied exports had the
`RARƎ` wordmark missing entirely (border and AGENCY only), which looks like a
broken export rather than a variant.

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

## Background depth: multiplane cards

Eight plates now, not four — every stage has a night and a day version. See
"Day and night" below for how one is chosen.

| stage | night cards | day cards | notes |
|---|---|---|---|
| EAV | 12 | **flat** | hand-cut; SAM added only the clouds |
| Edgewood | 14 | **flat** | richest signage of the four |
| Underground | 15 | 19 | most depth; day and night are DIFFERENT compositions, so the night cards do not fit the day plate and it got its own pass |
| L5P | 16 | **flat** | least headroom left |

The three **flat** day plates render as single-plate backdrops. That is the
outstanding work, and the client has asked for the same treatment on every
plate.

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

### Unlocking it, and the bug that hid inside that

The AudioContext is suspended until a real gesture. Getting that right took
three things, and skipping any one of them brings back "the sound doesn't
start until you pick up a money bag":

1. **Do not create the context before the gesture.** `audio.ambience()` only
   RECORDS what the game wants; `startPending()` builds the bed once there is
   a running context. Building the graph on a pre-gesture context is the iOS
   trap — Safari lets you wire the whole thing up and produces nothing until
   something is played from inside a gesture, at which point everything
   already sitting there becomes audible at once.
2. **Play a sample of silence inside the gesture.** `resume()` alone is not
   enough on iOS.
3. **Listen on every gesture, not the first.** The listeners were `once`; one
   refused `resume()` and the game is silent for the session. They detach
   themselves when `audio.ready()` goes true.

The fade-in is **linear over 0.8s**. It was exponential over 3s, which is not
a fade, it is silence followed by a fade: measured at 0.6% of target level at
150ms and still only 11% at 1.5s.

`audio.level()` returns the RMS of the master bus and `audio.status()` reports
context state and ambience gain. They exist because this class of bug cannot
be found by reading the code — the graph was correct the whole time it was
silent — and cannot be heard in a headless browser.

---

## Day and night

The stage table in `src/world/stages.js` is written **night-first**: `bg` and
`light` are the night dressing, and each entry carries a `day: { bg, light }`
twin. `STAGES` is the RESOLVED list — `resolveStages()` folds the chosen half
up to the top level, so the renderer, the image manifest and the ambience all
keep saying `stage.bg` and never learn which one they got.

**What picks it:** `new Date().getHours()` — the device's own local hour,
already through whatever time zone the phone is set to. No permission prompt,
no network, no geolocation dialog in front of a game nobody has started yet.
Night is 19:00–07:00.

**Its limit, stated honestly:** a fixed clock boundary is not sunset. Atlanta
is dark near 17:30 in December and near 20:50 in June, so an early-summer
evening hands you night streets while it is still light out. Doing better
needs latitude and day-of-year, which needs location.

`?tod=day` and `?tod=night` force it. That is not debug scaffolding to strip
— it is how both halves get checked without changing a phone's clock.

**Day plates carry no rain and no practicals.** Neon and streetlights do not
read at midday, and painting them as if they did is what makes a day scene
look like a night scene with the brightness turned up.

**Not finished:** only Underground's day plate is cut into multiplane cards
(19). EAV, Edgewood and L5P day are FLAT — the renderer treats a stage with no
`cards` as the old single-plate backdrop, which is shallow, not broken. The
client's instruction is uniformity: the same cut on every plate, day and
night. `groundFrac` for the three flat ones was derived by aligning each day
plate's row-wise edge profile against its night twin, since the exports are
not the same height; EAV and Edgewood match their night framing closely,
**L5P day currently draws a little larger than L5P night** and should be
settled against its card extents when it is cut.

---

## Title and ending screens

Both are the client's own paintings shown WHOLE, with the moving parts cut off
them by the SAM pass and drawn back on top. `tools/cut_still.py` does the
cutting — deliberately NOT `cut_planes.py`, because a still scene does not
scroll and only needs the movers lifted; most masks are left unassigned on
purpose.

The base IS inpainted under the movers. A card is drawn over the base, so
without that the base's own copy peeks out as a ghost the moment it moves.

| screen | moves | how |
|---|---|---|
| title | clouds | each its own sprite, crossing and wrapping, 50–95s per crossing |
| title | signs | shear about the foot of their posts |
| title | Will Hill | shear about his shoes, ⅓ the signs' amplitude |
| ending | crowd | three depth bands, each about its own floor, bigger toward camera |
| ending | Will Hill | his own slower beat, not swept along with the crowd |
| both | PRESS START | additive glow, not a blink |

**Clouds travel behind the skyline.** That needs the plate split into what is
behind them and what is in front, so `sam_group.py` keeps the sky as a layer
for still scenes (its entry needs an EMPTY box — a real one makes it a
catch-all that swallows every mask in the picture). The buildings never move:
measured 0.0% pixel change either side of the hero across 1400 ticks.

**Amplitudes are fractions of the painting's drawn width**, not pixels — these
contain-fit a 1536px painting into anything from a 390px phone upward.

**The letterbox is flat black.** Two attempts at filling it with the painting
itself (a blurred cover-fit copy, then the plate's own edge rows stretched
out) were rejected on sight: stretching six rows of a DITHERED pixel painting
carries the dither, and dither stretched vertically is stripes.

---

## Nothing bleeds between screens

The client's standard: "only the pages that are meant to be seen should be
seen." Two rules hold it up.

**Every full-screen state clears the frame first** — title, ride, results and
the loading screen all fill the canvas before drawing.

**The touch pads are opt-in.** `#touch` needs BOTH `body.touch` and
`body.playing`, and `syncPads()` sets `playing` from `state.screen`. It used
to be the other way round — shown on any touch device, switched off per screen
— which flashed the pads over the title card for the gap between input.js
detecting touch and the loop's first tick. And `syncPads()` runs at the top of
**`draw()`**, not `update()`: the screen can change part way through update()
(the playing branch is what sets `stageClear`), so syncing there reads a state
one tick stale.

Audited with `scratchpad/bleed.mjs`, which samples the pad's computed style
and the game's screen on every frame: **0 frames with pads on a non-playing
screen** across ~820 frames, day and night. Note the sampler must run AFTER
the game's own rAF callback — a watcher registered first reads the DOM from
before the game drew and reports a one-frame lag that is the harness's.

---

## Leaderboard and the contest

**Decided with the client, 2026-08-12.**

**THE PHONE NUMBER IS THE IDENTITY.** Not the display name — two people called
Will are two people, and one person can type six different names. The Worker
keys entries on the digits, so later runs UPDATE a player's line instead of
filling the board, and it keeps their best.

**NO SMS VERIFICATION.** Client's decision, and the reasoning holds: a web
page cannot stop somebody typing a made-up number, and the usual substitutes —
device fingerprinting, a localStorage flag — are weak and clear on reinstall.
What protects a contest is that the PRIZE IS CLAIMED on the number and address
given, so a fake entry wins nothing and costs nothing to allow. Verification
can be added later without changing the schema. **Do not re-litigate this
without new information.**

**Storage is split, and the split is the point:**

| key | contents | who reads it |
|---|---|---|
| `lb:runs` | `{ id, name, score, t }` × CAP, sorted | `/top`, public |
| `pii:<id>` | `{ phone, email, name, t }`, one key each | **nothing** — read out of the KV dashboard by hand when contacting a winner |

`id` is a truncated SHA-256 of the normalised digits, so nothing leaving the
Worker walks back to a phone. The old shape kept phone and email inside the
public array and relied on `/top` remembering to project them away; one
forgotten field in one response and the entrant list is public. Separate keys
cannot be leaked by forgetting.

**Where it lives:** the panel (`src/ui/panel.js`, markup in `index.html`),
reached from **OPTIONS on the title card** — which was painted into the
client's artwork and did nothing until now — and automatically off the tap
that leaves the results board.

**When it asks:** at the END of a run, never before. Nobody fills a form
before they know whether they like the game, and the moment you have just
seen your score is the only moment a phone number is worth asking for.

**It is HTML, not canvas.** A canvas text field means hand-rolling a caret and
a keyboard and still getting none of the numeric pad, `@` key, autofill or
paste that a real `<input>` gives free on a phone. Inputs are 16px minimum or
iOS zooms the page on focus.

**Only the phone is required.** The name defaults and the email is optional —
every required field costs entrants.

**Runs bank locally regardless** (`wh_local_runs`, best 10). That is what the
board shows while `LB_URL` is empty, and the fallback when a phone is on a bad
connection at a party, which is exactly where this gets played. A board that
says "could not load" is worse than one showing your own last ten runs.

**Still to decide:** the prize and how the winner is contacted. That does not
change the schema — the private key already holds both phone and email — but
it does decide how hard the identity check needs to be.

---

## Still open

- **Daytime multiplane for EAV, Edgewood and L5P.** The biggest outstanding
  item. Day plates and SAM passes are on disk; they need grouping, cutting and
  wiring, same pipeline as every other plate. The client's word is uniformity:
  identical treatment on all eight plates, the only difference being day and
  night. See "Day and night" above for what is wired now.
- **End-credits sequence.** The ending SCREEN is built (his painting, real
  stats, swaying crowd). The credits that share the frame with it are not, and
  are blocked on files that have only ever been in chat: the RARƎ AGENCY logo
  and prodbyKCTW's logo.
- **Four Will Hill tracks**, one per stage. There is no music at all yet —
  four SFX plus the procedural street bed. Will need streaming per stage
  rather than up-front loading, and a duck on the music when the punch fires.
- **The Worker is still not deployed.** Everything client-side is built and
  works against the local fallback; `LB_URL` is empty and the KV namespace
  does not exist. Creating it and running `wrangler deploy` touches the live
  Cloudflare account and stays a manual, explicitly-confirmed step.

### Corrected — these were listed as open and are DONE

Left here because a stale "still open" list already cost this project a
session of re-doing finished work.

- **Roll/hit/death clips exist.** The player atlas carries all twelve: death,
  fall, hit, idle, jog, jumpLand, jumpStart, knockback, knockdown, roll, run,
  walk.
- **The MARTA map is built** — `src/render/martamap.js`, on the client's own
  rail map, with station coordinates measured by ring centroid and the train
  following the polyline by arc length.

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
