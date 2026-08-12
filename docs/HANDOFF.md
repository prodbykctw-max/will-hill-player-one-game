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

## The stomp — the only attack in the game

**It had a THREE TICK window. Fifty milliseconds.** Traced against the live
physics, not estimated. That is not a skill check, it is a coin toss, and it
is why landing on someone felt like luck.

The cause was structural, not a bad constant. The stomp was a SUB-CASE of the
body-overlap test, so the feet had to already be inside the enemy's box
(`feet > enemy.y + 6`) while also being above its middle (`< enemy.y + h*0.55`).
Those two leave a 31-unit band, and a falling body crosses 31 units in three
ticks. Every knob inside that shape buys single ticks.

**The stomp now has its own box, tested BEFORE contact damage:**

| constant | value | why |
|---|---|---|
| `STOMP_REACH` | 95 | above the head. Covers a full-hold jump's apex (81 above a 77-unit enemy); at 46 there was a hole in the middle of the timing sweep exactly at the apex — the most natural timing was the one that failed |
| `STOMP_DEPTH` | 0.62 | how far into him the feet may go |
| `STOMP_SIDE` | 6 | horizontal slop per side |
| `STOMP_MAX_RISE` | −5.5 | **not** "must be falling". A jump timed slightly late arrives still rising, and a rising player with his feet over someone's shoulders was being read as walking into him |

Measured with `scratchpad/hitrate.mjs`, which sweeps every jump timing at
three approach distances and reports how many land:

| approach | before | after |
|---|---|---|
| 90 units | **0/18 — impossible** | 4/18 (133 ms of leeway) |
| 150 units | 5/18 (166 ms) | 9/18 (**332 ms**) |
| 210 units | 6/18 (199 ms) | 14/18 (**465 ms**) |

⚠️ **READ THAT HARNESS AS A BAND, NOT A NUMBER.** Those are single readings.
Run it repeatedly on an unchanged tree and it returns 2-4 / 7-9 / 9-13 —
headless frame-timing jitter moves the 210-unit case by four hits. A single
low run has twice now looked like a regression and been noise both times. If
a change here appears to have cost hits, **re-run it three times and compare
bands**, and if that is not conclusive, `git stash` and get a baseline from
the same session.

Supporting changes, all from the same client note:

- **Enemies 1.58 → 1.80 → 1.90 → 2.01 m**, and the last step is aligned to a
  landmark: **their EYE LINE sits on row 36 of Will Hill's cell**, the top
  line of his glasses. Measured to within 0.3 units.

  That needs them slightly TALLER than him overall, which is not obvious: a
  balaclava and a hood carry bulk ABOVE the eyes, so their eye top is 10.8%
  down from their crown while his row 36 is 9.8% down from his. Eye-to-eye
  therefore puts their hood above his cap. Their collider lands on 86 — the
  same as the player's.

  **This is the height that broke the game once.** At 1.94 m the collider was
  163 against a 158-unit apex and stomping was mathematically impossible. It
  is safe now only because the stomp box was fixed first; re-run
  `scratchpad/hitrate.mjs` before believing any change here. Verified at 2.01:
  windows unchanged at 133 / 332 / 465 ms.

  The height was never the real constraint; once the hit test was fixed it was
  free to be whatever reads right.

  **MEASURE HEIGHTS OFF `entity.__box`, NOT OFF THE METRES.** The two sheets
  carry different amounts of empty space in their cells and different `fit.h`,
  so equal metre figures do NOT render as equal heights, and three separate
  attempts to derive "how tall does he look" from the atlas all disagreed with
  the screen. `spriteBox`/`drawSprite` now publish the rect they actually use
  (DEV only) — read that.

  The client asked for their heads to reach "row 36, the top line of Will
  Hill's glasses". Measured back through the box, row 36 of his 251-row cell
  is 151.8 units above his feet, and their walking head at 1.80 m was already
  at 152.0 — the line he picked was where they already stood, so following it
  literally would have changed nothing while the sentence beside it said "he
  needs to be a little bit bigger". Intent won.
- **`AIR_ACCEL_MUL` 0.55 → 0.85.** At full run a jump carries 450 units
  (5.36 m) horizontally, so the arc is fine — but run speed takes 21 ticks to
  reach, so a jump from a standstill or a walk goes nearly straight up AND
  COULD NOT BE CORRECTED. Aiming a jump is half the skill; at 0.55 that half
  barely worked.
- **Patrol range 96 → 170.** At 96 an enemy reverses every 69 ticks, so he
  often turns while you are mid-flight — you are not aiming at a moving
  target, you are aiming at one that changes its mind.
- **The enemy walk was skating, and is now cut to one stride.** Same bug class
  as the player's walk. The 16-frame clip holds TWO FULL STRIDES; at the
  default 4 ticks/frame that is a stride every 32 ticks, which at 1.4 px/tick
  covers **44.8 units — half a metre**. A two-metre man does not take
  half-metre strides, so the legs ran at nearly four steps a second while the
  body drifted past at walking pace. Now 8 frames at 11.1 ticks: measured in
  the running game at **1.47 m per stride against the player's 1.48**, which
  is the point — they are the same height, so matching STRIDE LENGTH rather
  than cadence is what stops the feet sliding.

  ⚠️ **AUTOCORRELATION SAYS THE PERIOD IS 4. IT IS 8.** Half a stride of a
  side-view walk is the same pose with the legs swapped, and that survives the
  24×24 downsampling `measure_cycle.py` does, so the tool reports the HALF
  period. Two independent checks say 8: lag-8 similarity is 0.96–0.99 against
  lag-4's 0.73–0.80, and the **foot spread** — purely geometric, no feature
  vectors — peaks four times across sixteen frames, i.e. four steps, two
  strides. Expect this trap on any side-view locomotion clip.

  The 8-frame window starts at offset 4 (5 for variant b), not 0: the loop
  seam scores **0.999** there against as low as 0.63 at the worst offset, and
  0 is the worst offset for variant b.

  While in there: `defeat` now carries an explicit `ticks: 3`. `DEFEAT_TICKS`
  has always been `frameCount * 3` but `advanceAnim` was defaulting the clip
  to 4, so the enemy despawned on frame 12 of 16 and the last quarter of its
  own defeat never played.
- **The champagne grow STUTTERS, like Mario.** A smooth 320 ms ease was a
  perfectly good transition and the wrong reference: what makes the mushroom
  read is that Mario does NOT ease — he snaps between the two sizes several
  times, and the flicker is what the eye reads as "something happened to him"
  rather than "the camera moved closer". Four hard 140 ms steps
  (small/big/small/big) then settle; growth raised 0.22 → 0.30. The collapse
  at the far end stays smooth, because running out is a warning you want to
  feel coming rather than an event you want noticed.
- **The champagne aura was sized off the COLLIDER.** Every measurement was a
  multiple of `p.h` (86) while Will Hill is drawn 170 tall, so the bright core
  landed at mid-thigh and read as "sparkly shit behind him". Now driven by the
  drawn height and centred on the chest, rising past the crown.

`window.__forceInput = { right: true, jump: true }` (DEV only) holds a button
frame-exactly. A three-tick window cannot be measured by hand — human tap
jitter is larger than the thing being measured.

---

## Knocked down in mid-air — he has to land first

**`stepPlayer` returns immediately when `dead`**, so nothing applied gravity
to a knocked-down player. Take the hit at the top of a jump and he hung there
— while the stomp-out beat started anyway, three men gathering on the
pavement to stomp an empty patch of road underneath him. The client's words:
"he stays floating in the air… they were stomping the ground, he wasn't
there."

`stepKnockedDown(p, map)` in `entities/player.js` runs instead: gravity,
terminal velocity, both collide passes, no input. `main.js` calls it and
`return`s until `onGround`, so `state.stompT` is not set — and therefore the
stompers are not summoned — until he is actually down. The same gate covers
pothole trips and last-heart hits; a fall down a hole goes straight through,
because falling **is** that death and `FALL_DEATH_Y` already owns it.

Horizontal momentum is bled (`vx *= 0.94`) rather than zeroed. He was knocked
in a direction and nothing stops dead in mid-air.

**`fall` is the wrong clip for a botched stomp.** That clip is the MANHOLE —
arms up, legs kicking, authored to read as final. Coming off a mistimed jump
at an enemy is a metre onto the pavement, so it plays `knockback` instead, and
`fall` is kept for genuine drops. The switch is on **speed, not height**:
`vy > 10.6` (about 108 units of fall) — speed *is* the drop, since he has to
have been falling a while to build it, and it needs no extra state.

Not `stepCorpse`, and the name matters. He is not dead; he got jumped and
robbed. This repo has already lost five sprite generations to death-and-victim
vocabulary leaking into the work — keep it out of the code as well.

Verified with `scratchpad/airdeath.mjs`, which puts him at a given height,
knocks him down, and traces every frame:

| knocked down at | lands on frame | stomp-out starts | clips used |
|---|---|---|---|
| 45 units up | 10 | 11 | `knockback` → `knockdown` |
| 150 units up | 18 | 19 | `fall` → `knockback` → `knockdown` |
| 320 units up | 26 | 27 | `fall` → `knockback` → `knockdown` |

Landing always precedes the beat by exactly one frame — the gate releases, the
next tick sets `stompT`.

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
- **The pickups are sized by RATIO, not by realism.** A real champagne bottle
  is 0.32m, which on this street is a 27-unit green speck, so it was already
  exaggerated to 0.66m — and that was still wrong in a way only the ratio
  shows: it drew **17.8 x 55.5 against a money bag's 50.3 x 52.1**, so the
  only pickup that changes what you can do covered **0.38x the screen area**
  of the commonest one. A bottle's silhouette is narrow (54:168 in the source
  art) and height alone cannot compensate. Now 1.0m — 27 x 84, **0.87x the
  bag's area and half Will Hill's drawn height** — so it wins on the one axis
  a narrow object can. The aspect ratio is untouched; widening it would be
  stretching the art. `champagneTopFor()` places it, because `y` is the TOP
  edge and the generator's old hardcoded offset grew the bottle down into the
  pavement.

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

Synthesised on top of those four: the ambience bed, the power-up/power-down
arpeggios, and the three UI cues — see "Button feedback" below, which also
covers the haptics that go with them.

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
client's instruction is uniformity: the same cut on every plate, day and night.

### Day framing — measured off landmarks, and it was badly wrong

The client, on stage one: *"the daytime image zoomed in too much… you can't
even see the damn bottom of the tree, the fence."* He was right, and the
numbers are not close:

| stage | groundFrac | meters | rendered vs night |
|---|---|---|---|
| eav | 0.766 → **0.882** | 8.0 → 7.81 | **+19.7% → +1.5%** |
| edgewood | 0.816 → 0.821 | 7.0 → **7.70** | −7.7% → +1.0% |
| l5p | 0.677 → **0.730** | 9.0 → 9.25 | +7.0% → +2.0% |
| underground | held at 0.78 | held at 8.6 | +0.0% |

`groundFrac` is a CROP. Set it above the painting's own ground line and the
bottom of the picture is thrown away before it is ever drawn — eav-day was
cutting through the middle of the fence and losing the footings, the grass
verge and the base of the tree; l5p-day was cutting through the shop windows
and losing the RECORDS·TAPES·CDS board and the kerb. That is the whole of the
client's complaint, and it is separate from the `meters` error that made what
survived 20% too big.

⚠️ **THE OLD NUMBERS CAME FROM 1-D EDGE PROFILES. DO NOT GO BACK TO THAT.**
Aligning the two plates' row-wise edge-energy profiles cannot separate scale
from offset: one number per row discards which feature a peak belongs to, so
the search has a large family of near-equal answers. Re-run honestly, with the
sky excluded and both parameters solved together, it returns groundFrac
**1.595** for eav — row 866 of a 543-row file.

**`tools/check_day_framing.py` uses one NAMED LANDMARK per stage**, matched in
2-D by normalised cross-correlation over a scale sweep — the WELCOME TO EAST
ATLANTA oval, the OUR BAR ATL window, the CRIMINAL RECORDS fascia, the
marquee arch. NCC is invariant to brightness, which is the entire difficulty
of comparing a night painting to a day one. It writes a proof image of the
match; look at it. The matches land at scales of **0.98–0.99**, meaning the
two paintings of each corner are drawn at all but the same source scale —
which is why the corrected eav-day `groundFrac` sits within 0.002 of the night
plate's 0.88 rather than 0.11 away from it.

**Underground is held deliberately.** Its match scores 0.315 against the
others' 0.50–0.57 because day and night there are genuinely different
compositions, it already renders within 1.5% of night, and it is the one day
plate already cut into cards — nineteen of them, at 0.78. Moving its crop line
invalidates that cut for a correction smaller than the measurement's own error
bar. The tool prints `HELD` rather than a fix for it.

**Keep `tools/sam_segment.py`'s `GROUND_FRAC` in step with `stages.js`** — the
day cuts are taken at those fractions, so a mismatch cuts cards that do not
line up with the plate they belong to.

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

## The title card's two controls

**They were THIRTEEN screen pixels apart.** Colour-keyed off the plate, PRESS
START's last painted row is 907 and OPTIONS's first is 950 — 43 rows, which at
the current fit on a 430px phone is 12.9 screen pixels. A thumb is three to
four times that, so the client kept getting START when he meant OPTIONS.

(An earlier version of this section said 4.2 pixels, from 15 rows. Both were
wrong: the rows had been read off the SAM masks' padded bounding boxes rather
than off the lettering. It never changed the conclusion, only its size —
and the correct number is still far inside a thumb.)

Fixed three ways.

- **The screen is SPLIT, not dotted with buttons.** Everything above painting
  row 920 starts the game; everything at or below it — including all the black
  under the card — opens the panel. Measured on a 430x932 phone that is a
  588px target and a 344px target with one boundary between them, instead of
  two adjacent boxes.
- **`TITLE_ZOOM` 1.07 — the measured ceiling.** Every discrete element keyed
  by its own colour (luminance just returns the full width on a full-bleed
  scene): green WELCOME face from x 65, red 1UP from 54, pale 000000 from
  53; HI SCORE, 125680 and AHEAD ON all end by 1475. Leftmost 53, rightmost
  1475 -> 1.074. As large as the card goes without clipping his art.
  `TITLE_BIAS` stays **0** — the card is CENTRED. It was briefly lifted to
  -0.55 to hand the space below to the OPTIONS half, which was solving a
  problem the split had already solved. Client's note: it should "stay center
  and stretched in the up-and-down directions so it appears larger", i.e.
  bigger about its own middle, and bigger means the UNIFORM zoom, never a
  vertical stretch. A non-uniform scale on a dithered pixel painting is the
  same mistake as the letterbox filler that got thrown out.
- **THE WORD ITSELF MOVED.** See below.

### OPTIONS is cut out of the painting and re-placed

The client's instruction, and it is the right one: *"we could basically lift
options off of the page and then move it down slightly... we could use SAM on
that portion just options to lift it and do whatever we need to do to make sure
the background stays the same."*

**SAM mask #92 is the word** — one connected component, x 671..853, y 946..979,
5401px, holding **99.8%** of the word's colour-keyed glyph pixels with only
three stray bright pixels left in the entire band outside it. Added to
`tools/sam_groups/title.json` as its own group; `tools/cut_still.py` emits it
as a `WHOLE` sprite (one crop, not one per connected component — a word split
into seven letters that have to be re-spaced by hand is a typo waiting to
happen) and fills the hole.

**Placement is measured from the SPLIT LINE, not from the bottom of the card**,
and that is the correctness argument rather than a style choice. Anchoring
below the card is the obvious way and it is right only while there IS black
below the card. Widen the window to landscape and the zoom makes the card
taller than the display, the card's bottom goes off-screen, the placement
clamps to the last row that fits — and at 1280x800 the word came out with its
top on 740.0 against a split at 741.1. **Tapping the top edge of the OPTIONS
control would have started the game.** The band now runs from below both the
split and the painted PRESS START to the bottom of the display, which always
exists.

Three caps on the size, smallest wins: 40% of the display width, **3x the
card's own sampling rate** (past that the plate's dither becomes blocks — the
same artefact that got the stretched letterbox thrown out), and a third of the
band. On the target phone the first two land within 1.3% of each other so the
pixel-grid cap is the one that bites.

Measured on the live page at three window sizes:

| window | OPTIONS lands | scale | gap from PRESS START | on screen | in its own zone |
|---|---|---|---|---|---|
| 430x932 phone | y 668.2, 169.8x35.9 | 3.00x the card | **83.9px** (was 12.9) | yes | yes |
| 932x430 landscape | y 408.3, 50.9x10.8 | 0.60x | 15.8px | yes | yes |
| 1280x800 desktop | y 755.2, 94.7x20.0 | 0.60x | 25.0px | yes | yes |

Tapping the word opens the panel and tapping the art starts the game, at all
three sizes.

**The hole needed the grain putting back, and that is a new step.** Every other
mover is drawn back over its own footprint at rest, so the fill under it is
never seen and the pyramid blur is plenty. This one is relocated, so its hole
is on permanent show — and measured, the fill was wrong: **high-frequency
energy 0.80 against the surrounding road's 4.35-5.68.** At 4x it read as a
smooth patch in a speckled road, the shape of the word in negative.
`retexture()` in cut_still.py adds the high-frequency residual of a same-sized
strip of real road taken from just below the hole. After: **dither 3.89, rim
delta 0.83 levels, 3 bright pixels left of 1951.**

⚠️ A LEVEL CORRECTION WAS TRIED FIRST AND MADE IT WORSE. The fill looked 8-15
levels too dark next to the road above it, so it was offset to match — and the
rim went from 0.5 to -2.4, putting a visible edge where there had been none.
The road has a real vertical gradient (30 at the top of the strip, 23 at the
bottom), so "the road nearby" is not one number, and the pyramid fill already
carries the gradient correctly. **The rim is the only honest test.**

**What this replaced:** a drawn `LEADERBOARD · OPTIONS` button in the black
below the card. It worked, and it was wrong twice — a system-ui rounded
rectangle under a hand-painted arcade card, duplicating a control the painting
already had. Client: *"the big ass leaderboard option button at the bottom is
kind of redundant... let's use these tools."* Same position, his artwork, one
control instead of two.

OPTIONS still pulses, on the opposite beat to PRESS START and in a cooler
colour, via `stillscene.pulseRect` — the screen-space twin of `pulsePrompt`,
which can no longer express it as a rectangle of the plate.

Confirmed on the **production** bundle (`scratchpad/liveopts.mjs` against
`vite preview`, where the DEV hooks are gone and everything is read off
pixels): the word lands at y 675..696, x 136..292, centred to within 2px;
tapping it opens the panel; tapping the art starts the run; no failed
requests. **One** bright pixel is left where the word used to be — a stray at
plate (877, 952) that SAM's mask missed — and at 87 per channel it is *below*
the surrounding road's own maximum speckle of 91, i.e. inside the dither and
not distinguishable from it.

---

## Button feedback: click, confirm, and a tick under the thumb

Client: *"I want happy feedback and a clicking noise like button select noise
when you're selecting buttons"*, plus *"haptic feedback"*.

**THREE CUES, NOT ONE**, because a menu makes three different kinds of
statement and one beep for all of them teaches nothing:

| cue | says | sound | haptic |
|---|---|---|---|
| `click` | I heard you | 1180→1560Hz square, 45ms, + a 11ms noise tick | 14ms |
| `confirm` | that committed | G5-B5-E6 major triad at 42ms | 14, 40, 26 |
| `back` | we went the other way | A5→D5 falling fifth | 14ms |

All three are under 130ms. A UI sound is heard hundreds of times a session and
the only sin available to it is being long enough to notice twice. They share
the square-wave timbre of the power-up cues so the menu sounds like the same
machine as the game, and they sit at ~0.09 against the punch's 0.95.

**THE PADS GET A TICK AND NO SOUND**, deliberately. The four movement/action
pads are pressed several hundred times in a run; a menu click on each would be
a metronome over the punches and the money bags, which are the sounds that
carry information. The haptic is silent, private to the hand, and can fire as
often as it likes. It fires on the edge into `on` only, so rolling a thumb
from ◀ to ▶ ticks once, not twice.

**iOS HAS NO VIBRATION API and never has.** `navigator.vibrate` is undefined on
every version of iOS Safari. `src/core/haptics.js` carries the one route that
exists — since iOS 17.4 a `<input type="checkbox" switch>` plays a haptic when
toggled inside a gesture — gated to iOS so it cannot touch any other platform.

⚠️ **THE iOS PATH IS UNVERIFIED AND NEEDS ONE PASS ON A REAL IPHONE.**
Playwright's "iPhone" profile is Chromium wearing an iOS user-agent: it
reports `navigator.vibrate` as a function, which real Safari does not, so
there is no way to tell "this works" from "the harness is lying". The Android
path IS verified.

**VIBRATION IS ITS OWN SETTING, not a rider on SOUND.** It is the setting that
matters most to the person playing with the sound off, which at a party is
most people. The switch disables itself and explains why when the device has
no route to a motor.

Verified with `scratchpad/feedback.mjs`, which wraps `navigator.vibrate` to
record every call and reads the master bus RMS through `audio.level()`:

```
tap OPTIONS (the word)   vibrate [14]          SAVE, empty form   vibrate [14]      back cue
ENTER THE CONTEST        vibrate [14]          SAVE, valid form   vibrate [14,40,26] triad
SETTINGS / BACK / close  vibrate [14]          tap the artwork    vibrate [14,40,26]
two pad presses          vibrate [8,8]         muted              silent, still [8]
```

Warm peak bus RMS: click 0.045, confirm 0.067, back 0.056. Muted: 0.00018.

**A cold first cue needed deferring.** The canvas pointerdown handler runs
before the window-level unlock listener — events bubble outward — so the very
first press of a session reaches the audio with a context that was constructed
one line earlier and is still `suspended`. Scheduling at `currentTime` on a
suspended context schedules into a clock that is not running, and by the time
`resume()` lands that moment is past. `uiCue()` defers until the resume
resolves: slightly late once, at boot, rather than missing once, at boot.

⚠️ AND THE FIRST MEASUREMENT OF THAT WAS ITSELF A HARNESS ARTEFACT. A cold
click read 0.00714 against a warm 0.045, which looks like a silent first
button — but `audio.level()` builds its AnalyserNode on FIRST USE, which on a
cold session is 13ms into a 45ms exponential decay. Predicted level at that
point: 0.085 x (0.0001/0.085)^(13/45) = **0.0071**. Measured 0.00714. Building
the probe first gives a cold click 0.021-0.030, same as a warm one. The
deferral is still correct; the quiet reading was not evidence for it.

⚠️ AND THE PAD CHECK HAD ONE TOO. Hardcoded tap coordinates put y=830 two
pixels above the left pad's top edge (it starts at 832), and the harness
reported a missing haptic that was never missing. **Read pad rects off the
live DOM.** Same class of bug as the unpinned camera and the stale feet
position — three now.

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

**All three fields are required**, and the form says so — on the intro line,
as a `required` tag beside each label, and as in-field helper text. An earlier
pass made only the phone mandatory on the "every required field costs
entrants" reasoning, which is true for a newsletter and wrong for a contest
entry: the name is what goes ON the board, and a single contact route with no
backup means a winner with a dead number cannot be reached at all.

The helper text lives INSIDE each field as well as beside the label, because
on a phone the label scrolls out of view the moment the keyboard opens and the
placeholder is the only line still visible. Validation reports the FIRST
failing field, outlines it and focuses it.

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
  item, and it is now part-done — **read this before starting, the groundwork
  is on disk.** The client's word is uniformity: identical treatment on all
  eight plates, "the same cut and trim and layering and movement and sway…
  at least minus the weather".

  | step | edgewood-day | l5p-day | eav-day |
  |---|---|---|---|
  | SAM pass | done | done | done |
  | `groundFrac` / `meters` | **fixed** | **fixed** | **fixed** |
  | region boxes | **done + verified** | **done + verified** | not started |
  | groups json | **written** | **written** | — |
  | union masks emitted | **done** | **done** | — |
  | plane list in `cut_planes.py` | TODO | TODO | TODO |
  | cut + `--debug` map | TODO | TODO | TODO |
  | cards wired in `stages.js` | TODO | TODO | TODO |
  | recompose check + in-game | TODO | TODO | TODO |

  **The region boxes were TRANSFORMED, not re-authored.** Each corner's day
  and night paintings are the same composition at 0.98–0.99 scale (measured —
  see the landmark section above), so the night plate's hand-authored boxes
  carry straight over: `edgewood day = 0.9900*night + (1.5, 35.2)`,
  `l5p day = 0.9800*night + (13.9, 9.3)`. That is better than re-reading
  fourteen boxes off a proposal sheet, because the night boxes are KNOWN GOOD
  — a bad day assignment can then only come from the transform or from SAM
  proposing differently, and both show on `--map`. Both maps were looked at:
  every card landed on the right object.

  **Sky and clouds have no night box to transform** — the night plates are a
  black band there — so `clouds` is read off the day art directly and sits
  FIRST in the region list, because most-specific-first is what stops the
  skyline swallowing it. The client asked for clouds moving in the daytime;
  that card is what will carry it.

  **EAV day is the odd one out and needs a from-scratch pass.** EAV night was
  never grouped through `sam_group.py` — it is hand-cut in `cut_planes.py`
  with colour rules that are explicitly night-only ("strictly blue-dominant
  AND dark", "shadow is warm or neutral here"). None of that survives a blue
  sky, so eav-day needs its own region list read off
  `tools/captures/sam/eav-day_proposals.png`.
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
- **The iOS haptics path has never run on an iPhone.** One pass on real
  hardware is all it needs: open the game, tap OPTIONS, feel for a tick. If
  nothing happens the fallback is inert rather than broken — the sound still
  plays and nothing else changes. See "Button feedback" for why it cannot be
  tested from here.
- **The enemy STOMP clip holds ~2.3 cycles in 16 frames** (period 7 on
  variants a and b, 8 on c). Left alone, and for a reason the walk did not
  have: the enemy is STATIONARY while stomping, so there is no ground speed
  for the cadence to disagree with, and at 4 ticks/frame it reads as roughly
  two stomps a second over a ~1.6s beat, which is a beating rather than a
  defect. It is on the list because `measure_cycle.py` will keep reporting it,
  not because anything looks wrong.

### Corrected — these were listed as open and are DONE

Left here because a stale "still open" list already cost this project a
session of re-doing finished work.

- **Roll/hit/death clips exist.** The player atlas carries all twelve: death,
  fall, hit, idle, jog, jumpLand, jumpStart, knockback, knockdown, roll, run,
  walk.
- **The MARTA map is built** — `src/render/martamap.js`, on the client's own
  rail map, with station coordinates measured by ring centroid and the train
  following the polyline by arc length.
- **The enemy walk clip is cut and timed.** One stride of 8 frames at 11.1
  ticks; measured in the running game at **1.47 m per stride against the
  player's 1.48**, down from 3.8 strides/sec. See the stomp section.

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

**Checking the PRODUCTION build.** `window.__game` / `__camera` / `__audio` /
`__title` are DEV-only, so a harness pointed at `dist/` has to go by pixels and
behaviour — which is the harder and better test. Serve it with
`npx vite preview --port 5299 --outDir dist`.

⚠️ **A HEADLESS BROWSER CANNOT REACH THE DEPLOYED URL FROM THIS ENVIRONMENT.**
Chromium will not go through the session's egress proxy — with `proxy:`,
`--proxy-server`, or neither, the navigation fails `ERR_CONNECTION_RESET` and
the proxy's own log shows it never receives the CONNECT (only Chromium's
telemetry to clients2.google.com). `curl` works fine, so **confirm the deploy
landed by fetching the live index.html and matching its `assets/index-*.js`
hash against `dist/index.html`**, then exercise behaviour against
`vite preview`. That pair covers everything except Pages' own caching.
