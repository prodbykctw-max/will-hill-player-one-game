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

Also **Knowledge**, which he uses as a name for himself and not only as the
word the acronym starts with. His own list, given verbatim: *"prodbyKCTW,
a.k.a. Melvin D. Brown the third, a.k.a. KCTW, a.k.a. Change The World, a.k.a.
Knowledge — that's me. I'm the person making all of this."*

**"WE" MEANS HIM, OR HIM AND ME.** Stated outright and worth writing down,
because it decides how every note in this file and every commit message should
read: *"when I refer to 'we' I'm talking about myself mostly, and sometimes
myself and you. We, you and I, are us. We refer to anyone else by their given
name when I include them."* So a "we" in his messages is never a vague team —
it is him, or the two of us. Anyone else gets named: Will Hill, Chemo, Kema.

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
| EAV | 12 | 10 | night hand-cut; the day regions came from the night CARDS' own alpha boxes |
| Edgewood | 14 | 16 | richest signage of the four; day gains `clouds` and `trees` |
| Underground | 15 | 19 | most depth; day and night are DIFFERENT compositions, so the night cards do not fit the day plate and it got its own pass |
| L5P | 16 | 17 | day gains a `clouds` card |

**All eight plates are cut.** The day sets are the night sets — same card
names, same depths, same `rate`/`clamp`, same sway `top`/`pivot`/`amp`/`freq`
— with only `span` and the sway `xRanges` recomputed, from each day card's own
alpha bbox and the measured night→day transform, because the exports differ by
a percent or two in size. The client's framing, which is the right one: line
the two up as exactly as possible and reuse the prior cut "unless there's
something that specifically requires it to be specific to that version".

The day plates gain a `clouds` card that the night ones cannot have — their
sky is a black band with nothing in it to lift.

⚠️ **A DAY `bg.img` MUST POINT AT `<stage>-day-base.webp`, NOT `<stage>-day.webp`.**
The base is the inpainted plate with every card lifted out of it. Point it at
the whole painting and every item appears twice the moment parallax moves a
card.

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

All four day plates are cut into multiplane cards — see the table under
"Background depth" for the per-stage counts.

### The SETTINGS switch, and why it reloads

The client: *"when I select always day from settings it doesn't change."* He
was right about the symptom and it was not the setting that was broken. The
value always **saved**, and a run started after a manual reload always came up
in the right half — measured, both directions. What was missing was anything
that applied it *before* one: `STAGES` is resolved once at module load, and
`onTimeOfDayChange` was never passed to `createPanel` at all. The note under
the row said "takes effect next time the game loads", which on a phone — where
there is no visible reload — reads as a dead switch.

**It now calls `location.reload()`.** That is the fix, not a dodge. Changing
the half changes which of eight plates and ~60 cards the image manifest has to
hold, plus the sky gradient, the lighting rig and the rain; re-resolving all of
it live is a lot of machinery to apply one setting, and every bit of it is
already correct on a cold boot. `wh_tod` is in localStorage before the reload
fires, so the new page comes up in the half he picked.

**It comes back to the same pane.** `sessionStorage.wh_reopen = 'settings'` is
written before the reload and read-and-cleared once at boot, so the blink lands
you back on SETTINGS with your value showing — a settings switch that dumps you
out to the title is its own small broken thing. A plain refresh does not reopen
it; that is checked.

**Mid-run returns `false` instead**, and the panel says "applies when this run
ends". Nothing opens the panel mid-run today — OPTIONS on the title and the end
of a finished run are the only two doors — but a reload that eats somebody's
contest run is bad enough to guard before a third door exists.

Measured end to end (`scratchpad/todset.mjs`, no manual reload in the day/night
legs): pick day → panel returns open on SETTINGS at `day`, run reports
`stageTod: day`; pick night → `stageTod: night`; plain refresh → panel stays
shut; pick auto at device hour 0 → night. And again on the **shipped** bundle,
by pixels rather than state — day sky luma 93.0, night 30.1, rain only on the
night frame. See "Verification recipe".

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

## The soundtrack

Ten cues, all wired, all **prodbyKCTW's own instrumentals** — he sent eleven
and paired them himself on a bench built for the job. His pairing is recorded
in `tools/cue_sheet.json`; that file is a creative decision, so edit it rather
than the mp3s. Two tracks went unused (`strange_girl`, `remembering_the_journey`).

| slot | track | on screen | cut |
|---|---|---|---|
| `title` | Knowledge x POLO | until they press start | 68.1s |
| `stage_01` | 3.10.26 (2) | 40s floor | 46.3s |
| `map_01_02` | Knowledge B.Jordan 002 | 2.5s | 29.1s |
| `stage_02` | salvador / Knowledge | 43s | 57.1s |
| `map_02_03` | Project 6 | 2.5s | 28.0s |
| `stage_03` | strange girl | 47s | 76.8s |
| `map_03_04` | 2GetHer | 2.5s | 23.9s |
| `stage_04` | lonliness 2 | 50s | 66.2s |
| `ui_pause` | doggzzz | while paused | 39.2s |
| `credits` | Project 9 | once, no loop | 41.4s |

Project 9 was on `stage_03` and `credits` both, which meant the ending replayed
the beat the player had just run a stage to — and because its hook sits at
1:57.5 of a 2:38 track, there are only 40.5s after it, so the two cuts were the
same forty seconds rather than different sections. The client moved strange
girl onto stage three, which leaves Project 9 to the credits alone.

⚠️ **`credits` is 41s and does not loop** — the only cue without that
protection. If the credits roll ever runs longer, the tail plays in silence.
strange girl was the candidate that fixed it (2:28 usable after its hook, the
most of any of the eleven) and it went to stage three instead, so this is still
open.

### The files start at the hook, and that is not cosmetic

`startAt` was supposed to open a cue on its hook and skip the intro. **It only
half worked**, and the failure is worth remembering: a media element with
`loop = true` wraps to ZERO, not to `startAt`. First pass opened on the hook;
every pass after it played the intro the offset existed to avoid. Invisible on
a stage, obvious on the title card, which loops for as long as anyone sits
there.

So `tools/cut_loop.py` cuts each file so the hook IS frame zero. Every
`startAt` is now 0, the native loop is correct and gapless, and 30.4MB of
source became **6.84MB shipped**.

⚠️ **A looping cue must keep `startAt` 0.** The field remains for one-shot cues;
on a looping slot a non-zero value is the bug above, not a feature.

### Finding the loop point — and two bugs the selftest caught

The length is found by **cross-correlation, not by tempo**. Snapping to a bar
needs the bar length, and beat trackers lock to whatever pulse is loudest: this
project's read 89 BPM on a track whose own filename says 135, which is exactly
two-thirds of it. Instead the tool searches lengths around a target and scores
each by how well the head matches what follows the cut.

Both bugs were found by `--selftest` against synthetic audio, before any music
was touched, and both would have shipped silently:

1. **The comparison was backwards.** It scored the window *ending at* the cut
   against the head. That is satisfied when the length is a whole period **plus
   the comparison window** — off by the arbitrary width of the window every
   time. On a signal with a known 4.0s period it confidently returned 9.5s and
   scored it 1.000; 9.5 is 8.0 + the 1.5s window. The right comparison is
   `head` against `mono[n:n+win]`, what genuinely followed.
2. **The crossfade made the join worse.** It faded the head into the head, so
   the clip ended on a sample 15ms deep into its own start and the wrap landed
   on two samples that were never adjacent: measured **13× the typical step
   before, 189× after**. The extra audio has to come from *after* the cut.

Fixed, the joins run 0–6× the track's own typical sample step (`credits` is
24× and does not matter — it never loops). Match scores 0.80–0.99.

### The first tap wakes the music; it does not start the run

The client: *"as soon as I click the icon I wanna hear the home screen music,
because that's what pops up immediately."*

Measured on a cold load, and the failure is not what it looks like. The title
cue is genuinely PLAYING the whole time somebody is looking at the card —
element unpaused, `currentTime` climbing 0 -> 0.73 -> 1.53 — but the
AudioContext is suspended, so it runs through a dead bus and makes no sound.
Tapping a home-screen icon is a tap on the OS launcher, not inside the page, so
no browser lets audio out on the strength of it. Then the first in-page tap
resumed the context AND started the run in the same gesture: 220ms later the
cue was `stage_01` and the title track had never once been audible.

So the title screen now spends one input on the music. It clicks, it ticks
under the thumb, the beat comes up on the card, and the next tap starts the
game. Verified: `ctx` false -> true with `screen=title` held and `t` still
climbing 1.98 -> 3.57, then the second tap fades `stage_01` in 0.227 -> 0.5.

Three guards, and each exists for a reason:

- **At most ONE input, ever** (`state.audioTapSpent`). A condition written on
  `audio.ready()` alone would eat every tap if `resume()` were refused, and
  leave the game unstartable.
- **Not when the sound is off.** Nothing to wake, so spending a tap would just
  be a dead first press. Checked: with `wh_sound=off` one tap still starts the
  run.
- **The keyboard path shares the same flag.** A desktop player pressing JUMP
  had the identical problem. One input total, whichever way it arrives.

It rarely costs anything in practice: any earlier interaction already unlocks
the context, so a tap that lands before `TITLE_ARM_TICKS` — or anything at all
touched first — means the start tap behaves as it always did.

### The cross-fade between cues is a different thing, and it works

`FADE = 0.9s` in `music.js`. Measured on a real START press: `title 0.55` →
`title 0.00 | stage_01 0.26` → `0.35` → `0.45` → `stage_01 0.50` alone. The
client asked for exactly this — *"I want it to kind of fade out once I hit
start… I don't wanna hear the intro music no more."*

Do not confuse it with the 15ms `XFADE` inside `cut_loop.py`: that one is
inside a single file at its loop point and is inaudible as a fade.

### Day and night music is one manifest line away

`todSlot()` in main.js prefers `<slot>_day` / `<slot>_night` when the manifest
has one with a `src`, and falls back to the shared `<slot>` when it does not.
So adding `stage_01_day` is the entire change; nothing else learns about it.
`stageClear` resolves through the same helper, or the clear card would
cross-fade to the other half's track for one beat.

### What a phone actually downloads

Measured against the production build, not guessed:

| | requests | bytes | audio fetched |
|---|---|---|---|
| boot to title | 93 | **6.70 MB** | `title` (1.07 MB) |
| entering stage one | 1 | **0.67 MB** | `stage_01` |

`preload='none'` means a cue downloads when its screen arrives and never
before. **The music is not what makes the game heavy** — ~5.6MB of the boot
payload is artwork, loaded eagerly by the image manifest, including all four
stages' plates and cards plus the ending and the MARTA map. Doubling the cues
for day/night adds **zero** to boot: a night player never fetches a day cue.

### Verifying it

`scratchpad/musiccheck.mjs` drives every screen and reads
`audio.music.status()`. Two traps it hit first:

- **The unlock gesture must not be a tap on the title card.** The lower half
  opens OPTIONS and every later click lands on the panel. Press a key the game
  does not bind.
- **The cues are `new Audio()` and never appended to the document**, so
  `querySelectorAll('audio')` finds nothing and a check written that way
  reports silence on a game that is playing fine. `status()` now exposes the
  element state and `srcs` for this reason. And you cannot check a slot by
  calling `play()` — main.js re-states the current screen's cue every frame and
  overrides it, which made all ten slots report whichever one the game was on.
  Load the URLs from `status().srcs` on your own element.

---

## The DAY plates are patchy, and here is why

The client: *"a whole bunch of daytime errors on the scenery."* He is right,
it is not subtle, and it is specific to the day cut.

`tools/harness/daynight.mjs` parks the camera at the same five fractions of
each stage in both halves and counts, per frame, **full-height hard columns** —
a vertical step across more than half the plate band, which is what a card edge
or a missing card produces, as opposed to a painted corner which only covers
part of the height. Night scores **zero everywhere, all four stages**. Day:

| stage | 2% | 25% | 50% | 75% | 95% |
|---|---|---|---|---|---|
| **eav-day** | 0 | 1 | 3 | **10** | **8** |
| edgewood-day | 0 | 0 | 1 | 0 | 0 |
| underground-day | 4 | 0 | 0 | 0 | 0 |
| l5p-day | 0 | 0 | 1 | 1 | 0 |

**EAV's day fence has vertical slots torn straight through it** in the back
half of the stage — you see the shrub and the skyline through gaps in the
planks. At the identical camera position the night fence is one unbroken run.

Diffing the two cut tables says why:

- **`eav-day` is missing `shrub_right` entirely.** `eav-planes.json` has 11
  regions, `eav-day-planes.json` has 10, and that is the one absent.
- **`edgewood-day` `parapet` span collapsed**: `0.024-0.997` at night,
  `0.049-0.102` in the day cut. A roofline that runs the width of the building
  became a mask 5% wide.
- **`underground-day` `backdrop` span collapsed** the same way: `0.27-0.82`
  became `0.299-0.348`.

Those two are SAM masks that caught a fragment instead of the whole object. The
fix is a re-cut of the day plates with those regions corrected — `sam_segment`
then `cut_planes` — not a patch over the symptom, and it wants doing carefully
rather than at the end of a long session.

Re-measure with:
```bash
PLAYWRIGHT=... CHROMIUM=... node tools/harness/daynight.mjs
```

---

## The repeat seam

`drawPlate` tiles each plate straight — not mirrored, because a flipped copy
renders CITGO and WELCOME TO EAST ATLANTA as backwards text. So the plate's
last column butts against its first. The client, walking EAV: *"it looks like
there's a layering issue with repeating the image."*

### It was two problems wearing one coat

**The first was a defect.** `l5p-base` opened with a column at luma 252 and a
second at 143, in front of a plate whose next column is 8.7 — a white line, on
every single row, 94× that plate's own 95th-percentile column step. Not
content: a resampling artifact left at the frame border by whatever produced
the plate, repeated every plate width as a bright vertical line down the
screen. `edgewood-base` had a milder version at its right border.

`tools/fix_seam.py --repair` clamps them: the first good column is copied
outward over the bad ones. **Not cropped** — every `span`, `xRanges` and
`light.x` in `stages.js` is a fraction of plate width, so a two-column crop
would slide every lamp glow off its lamp. Clamping keeps the coordinate system
identical and only replaces pixels that were never real.

| plate | join / median step | after |
|---|---|---|
| l5p-base | 250.7 / 165× | **8.3 / 5.5×** |
| edgewood-base | 47.6 / 23× | **11.7 / 5.6×** |

Everything outside the clamped columns is untouched to 50.2 dB / 48.3 dB PSNR
— that residue is the WebP re-encode at the same q92 `cut_planes.py` uses, not
the repair. Zero of the 118 cards had the defect; it is base-plate only.

**The second is the content genuinely not joining up**, and it is much less of
a problem than it sounds. See below.

### Measure it ON SCREEN, not in the file

The file-level score (last column vs first) says nothing about whether anyone
sees it. `scratchpad/seamsweep.mjs` walks each stage end to end, scores every
frame's column-step profile off the composited canvas — base, cards, lights and
rain together — and compares the join against **that frame's own 99th
percentile**. Under 1.0× means the join is no sharper an edge than the painted
architecture it sits among.

Two things that measurement immediately settled:

- **At real-world scale the plate is wider than the phone.** drawW runs
  478–1354px against a 430px canvas at a ~0.06 parallax rate, so a full period
  takes 500–600m of walking. **EAV's join never once reaches the screen** in a
  360-column stage, day or night. l5p's arrives at 440m of 450.
- The first version of the harness parked the camera at a computed boundary and
  reported numbers for three stages where the boundary is not reachable. The
  second read `level.stageEnd` — which does not exist; it is
  `level.stage.stageEnd` — silently fell back to 11000px for every stage, and
  covered 76% of l5p. Both produced confident tables that were wrong. Check
  coverage before quoting a sweep.

Where it stands, full-length sweep, worst join in the stage:

| stage | join on screen | worst join step | vs that frame's p99 |
|---|---|---|---|
| eav night / day | never | — | — |
| edgewood night | 42/87 frames | 11.2 | **0.86×** |
| underground night | 82/94 | 9.5 | **0.72×** |
| l5p night | 21/100 | 6.1 | **0.45×** |
| l5p day | 20/100 | 22.3 | 1.01× |
| underground day | 82/94 | 33.1 | 1.23× |
| edgewood day | 41/87 | 39.9 | 2.05× |

**Every night join is now under its own noise floor.** Three day joins are not.

### Why the three day joins are not a pixel problem

Look at what actually meets at each one (`scratchpad/seam_<plate>.png` dumps
the two ends side by side):

- **l5p-day** ends on a dark building and starts on a bright street — sky
  (79,143,219) against (21,43,70).
- **underground-day** ends in soft distance haze and starts on a hard-edged
  lit tower.
- **edgewood-day** is brick against brick with foliage growing over the join,
  and is the one a min-error cut would genuinely fix.

A min-error boundary cut (Efros–Freeman quilting) is the right tool for the
third and useless for the first two: it chooses, per row, which of the two
overlapping ends to take, and if they agree nowhere it just relocates the
edge. A cross-fade wide enough to reconcile a building with a street would
ghost the building over the street. **And either one costs width** — the
overlap columns are consumed — which means rewriting every fraction in that
stage's `stages.js` block. Six percent of the painting and ~60 hand-checked
numbers, to take one plate's join from 2.05× to ~1.0× at a spot where foliage
already covers it. Not taken. If it is ever wanted, edgewood-day is the only
plate where it pays.

The cheap alternative if these ever need to go: draw a soft dark vertical
gradient at the join, the way `drawRecession` already shades the ground line —
a building ending and another beginning has a shadowed gap in real life, and
spreading the step over ~20px lowers the per-column score as well as reading
better. It is a visible art change to every stage, so it is the client's call,
not a silent fix.

### Re-measuring

The two browser harnesses are COMMITTED, in `tools/harness/`, unlike every
other harness this project has written — because the table above makes numeric
claims and a claim nobody can re-run is not a measurement. Playwright is not a
dependency of this repo (the game ships no test runner), so the import is
resolved through `$PLAYWRIGHT`; point it at whatever the machine has.

```bash
python3 tools/fix_seam.py --selftest       # 4 checks, no artwork involved
python3 tools/fix_seam.py --measure        # file-level scores + corrupt columns

npx vite --port 5199 --strictPort &        # the harnesses need the DEV build
export PLAYWRIGHT=/opt/node22/lib/node_modules/playwright/index.js
export CHROMIUM=/opt/pw-browsers/chromium
node tools/harness/seamsweep.mjs night after   # on-screen, full stage
node tools/harness/joinshot.mjs  day   after   # crop of the worst join frame
```

`fix_seam.py` reads its file list out of `stages.js` imports, never a glob:
`eav-day.webp` and `eav.webp` are uncut originals kept for reference and both
match `eav-*`, so a glob hands them to the cutter as if they were cards.

Two DEV hooks exist for this and are folded out of the build
(`grep __plate dist/assets/*.js` returns nothing): `window.__plate` is where
the plate actually landed and how wide a repeat is, and `window.__startStage`
is the real function — a harness that assigns `state.stageIndex` without
rebuilding the level leaves `state.level` on the previous stage and the next
frame throws, which has already happened once to a harness that then quietly
measured a frozen loop.

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

### CHAMPAGNE RELAY comes off the card; MUSIC stacks under OPTIONS

Client: *"the champagne relay is not going to be there, that's like a
dev/dashboard thing. Nothing's gonna be there but PRESS START, OPTIONS and
MUSIC."* The three-column row (RELAY pill / OPTIONS / MUSIC checkbox) is
gone from `src/render/title.js` — `rowMetrics`, `relayRect`, `drawRelay`,
`hitRelay` all deleted, not just hidden. `core/relay.js`'s `isRelay`/
`setRelay` and the `?relay=1` URL flag still work exactly as before, and so
does the `window.__startStage` dev hook — that flag is the whole surviving
door now, "a dev/dashboard thing" with no on-screen button a player can find.

MUSIC now stacks directly under OPTIONS, centred on the same x. Client:
*"that music button ultimately is going to be under the OPTIONS button... and
that will be stacked perfectly."* `musicRect()` solves height and gap as ONE
budget against the true canvas edge — `room = canvas.height - (o.y + o.h)`;
if the ideal height + gap don't fit that room, the GAP holds at a 0.5px floor
and the HEIGHT gives way, never the reverse, and `y` is a direct sum
(`o.y + o.h + gap`) with no separate clamp — so MUSIC can never mathematically
land inside OPTIONS or past the frame edge, on any crop. (Two earlier
attempts — a fixed edge margin, then a two-step shrink — each had an
unsatisfiable pair of constraints on the two tightest phone crops tested and
put MUSIC a fraction of a pixel inside OPTIONS' own box. Caught by
`titlefit.mjs`, not by eye.)

Verification: `tools/harness/titlefit.mjs` (56 checks, 7 phone shapes —
no side bars, no overlap, MUSIC inside the frame, MUSIC x-centred on OPTIONS
within 1px, MUSIC below OPTIONS, `relayRect`/`hitRelay` both `undefined`),
`tools/harness/relaytod.mjs` (26 checks, rewritten to prove the removal as a
negative case — a plain tap always starts a normal run, never relay).
`tools/harness/relaybtn.mjs`, which existed only to test the removed pill,
was deleted rather than left to bit-rot.

### The 100vh bug — OPTIONS/MUSIC clipped off-screen on real iOS Safari

Client sent a live screenshot: PRESS START fully visible, **nothing below
it** — no OPTIONS, no MUSIC — on his phone with both the Safari address bar
and the bottom toolbar showing at once. Every harness shape (down to iPhone
SE and the client's own screenshot dimensions) was passing 56/56 at the time,
and the deployed bundle hash matched exactly what had been verified, which
ruled out a bad deploy or a stale build.

The actual cause was one CSS declaration: `#game { height: 100vh }` in
`index.html`. On iOS Safari, `vh` is anchored to the **large** viewport —
the height available with the browser chrome collapsed — not to whatever is
currently visible. `html, body` carry `overflow: hidden` (deliberately, so a
game canvas never rubber-bands), so there is no scroll to reveal the
shortfall when both bars are up: the canvas's CSS box claims more height than
the screen actually shows, and the excess — exactly where OPTIONS and MUSIC
draw, below PRESS START — is clipped off the bottom, invisible and
unreachable. None of the seven shapes in `titlefit.mjs` modelled "both bars
visible at once" because Playwright's fixed viewport can't replay Safari's
live chrome animation; the bug was real and specific to that device state,
not a regression in the fit math.

Fixed with the paired CSS/JS change dynamic-viewport units exist for:
- `index.html`: `height: 100vh; height: 100dvh;` — `100dvh` tracks the bars
  actually on screen; `100vh` stays first as the fallback for a browser that
  can't parse `dvh` (an unrecognised declaration is ignored, so the last one
  understood wins).
- `src/main.js`'s `resize()`: sizes the drawing buffer from
  `window.visualViewport` when it exists, and listens on
  `visualViewport`'s own `resize` event as well as `window`'s — iOS does not
  reliably fire a `window` resize when only its own chrome toggles.

Every existing harness still passed unchanged afterward (titlefit 56/56,
relaytod 26/26, musicbox 7/7, titleintro 6/6, relay 8/8) since this is a
sizing fix, not a change to the fit math itself. Directly reproduced and
confirmed fixed with a one-off Playwright script at a 393x660 "both bars up"
shape: canvas CSS box and drawing-buffer height now match the visible height
exactly (previously the CSS box would have been the large-viewport height,
taller than 660), and a screenshot at that shape shows OPTIONS and MUSIC both
on screen under PRESS START.

⚠️ **If a future "X is missing on my phone" report ever comes in again with
no matching harness failure, check the CSS viewport units before anything
else** — a real device's browser chrome is a state Playwright's fixed
viewport cannot fully stand in for.

### OPTIONS was crowding MUSIC on the tightest crops — the crop split moved

Client, on the phone that had just been fixed above: *"OPTIONS needs to be up
a little bit above the music section."* On the tightest crops the split
between top and bottom (see "the crop is split between top and bottom",
above) spent its two margins close to evenly — reasonable for the sky above
the title, wrong for OPTIONS, because whatever margin survives below it is
the ONLY room `musicRect()` has to work with. `fit()` in
`src/render/stillscene.js` now spends that leftover margin 25% above the
title / 75% below OPTIONS instead of proportionally to the source plate's own
165:209 split — same crop budget, same no-bars guarantee (this only moves
which end the EXISTING slack is spent on, it cannot make cropRows exceed
budget), just weighted toward where the room is actually needed.

That alone wasn't enough — `musicRect()`'s own shrink order was backwards.
When room ran short it held height at OPTIONS' own size and crushed the GAP
to a 0.5px floor, so on the tightest phone the two read as one control
instead of two. Flipped: gap now claims a small floor first (`Math.max(2.5,
room * 0.25)`), height takes whatever is left. First pass over-corrected —
gap got an equal cut and MUSIC shrank to 3px, unreadable, worse than close
together — so gap's floor is deliberately small, just enough to read as a
real seam rather than a hairline.

Verified: all five harnesses unchanged (titlefit 56/56, relaytod 26/26,
musicbox 7/7, titleintro 6/6, relay 8/8) — the checks are all inequalities
(no overlap, inside the frame, centred, below), not exact pixel equality, so
a legitimate rebalance within those bounds doesn't need new numbers, only to
keep passing them. Screenshotted at 471x825 and 393x660 (both "his
screenshot" and a fresh both-bars-up shape) to confirm MUSIC reads as
legible and separate, not just numerically non-overlapping — the first pass
passed every harness check while looking wrong on screen, which is why this
got eyeballed before shipping rather than trusted on the numbers alone.

### MUSIC checkbox unlocked the ambience, not the theme

Client: *"when I click music... it doesn't start the theme music... it just
starts the background, ambient nighttime noise."* Real, and findable by
reading the two unlock paths side by side rather than guessing — WebKit
tracks a `<video>`/`<audio>` element's gesture-unlock SEPARATELY from an
AudioContext's. `audio.unlock()` (`src/audio/audio.js`) only ever resumes
the WebAudio graph — which is exactly why the ambience (built from
oscillator/buffer nodes on that same graph) came through fine. The title
theme is a real `<audio>` element (`src/audio/music.js`, see "WHY <audio>
AND NOT decodeAudioData" — it has to stream, not decode, or ten cues would
be most of a gigabyte of RAM), and nothing in the MUSIC tap handler ever
called `.play()` on it directly. The only place that happened was
`update()`'s per-frame `audio.music.play(cueForScreen())` — one
`requestAnimationFrame` after the tap, outside the gesture, silently
refused, and then never retried: `play()` returned early on every later
frame because the slot already matched `current`.

Two changes, both needed:
- `src/audio/music.js`'s `play(slot)`: the early return for "already on this
  slot" now still retries `el.play()` if the element is stuck paused,
  instead of doing nothing.
- `src/main.js`'s `hitMusic` branch: calls `audio.music.play(cueForScreen())`
  directly, in the same synchronous tap handler that already unlocks the
  WebAudio graph — so the element's real, gesture-qualifying `.play()` call
  happens on the same touch that checks the box, not a frame later.

⚠️ **Not independently reproduced on real iOS hardware** — Playwright's
Chromium does not model WebKit's separate media-element gesture-gate, so
`musicbox.mjs` passing (7/7, unchanged) proves the checkbox still toggles
`wh_sound` and starts the *AudioBuffer-based* cue correctly in an automated
context, not that this specific iOS refusal is fixed. The diagnosis is a
structural one (`unlock()` never touches the element; the one line that did
call `.play()` ran a frame late) rather than an assumption, but it should be
confirmed on the client's own phone before being called closed.

### Lifting OPTIONS off the road — the word is IN the painting

Client, after the spacing pass above still wasn't right: *"can you not just
lift the options button up... like slightly up... and then move the music up
half... music is being cut off at the bottom slightly and options is just too
close on top of music, and it's a bigger space underneath the PRESS START
button, we could use that space as real estate... can you not just lift that,
make it transparent and put it there?"*

Measured on his shape (393x732, both Safari bars up) BEFORE touching
anything, and he was reading it exactly right: **22px of bare road between
PRESS START's foot and OPTIONS' top, and only 14px under MUSIC.** The empty
space was above; the crowding was below.

The catch is that OPTIONS is **painted into the portrait plate** at rows
1609-1635 — there is no layer to nudge (see "OPTIONS is cut out of the
painting and re-placed" above: that was the LANDSCAPE plate, where the word
was SAM-cut out and the hole retextured. Real work, and it needed
`retexture()` because the fill read as a smooth patch in a speckled road).

**None of that was needed here**, because of what sits under the word: 208
rows of plain road and nothing else. So instead of cutting the word out and
patching the hole it leaves, `liftOptions()` in `src/render/title.js`
**redraws the whole bottom band of the plate shifted up by `OPTIONS_LIFT`
rows.** The word rides up with the band and the road closes behind it by
itself — no hole, so nothing to retexture.

- `OPTIONS_LIFT = 16` source rows (~7px on his phone).
- `optionsRect()` returns the LIFTED position, so the hit box and the pulse
  follow the lettering without either being told separately.
- MUSIC comes up **half as far**, exactly as asked: it hangs off
  `optionsRect()` so it would otherwise follow the full lift for free, and
  adding `LIFT/2` back onto its gap is what leaves it behind by the other
  half. Net on his phone: OPTIONS up 7.4px, MUSIC up 3.7px, the gap between
  them 14 → 17.7px, and the room under MUSIC 14.1 → 17.8px.

⚠️ **`BAND_TOP` is measured, not chosen, and it is pinned between two hard
limits.** `BAND_TOP - OPTIONS_LIFT` must stay below PRESS START's foot or the
shift saws the bottom off his prompt; `BAND_TOP` must stay above 1609 or the
band doesn't carry the word it exists to move. **`PROMPT` is rows 1518-1572** —
an earlier pass in this same session read that foot as 1561 from a guess
(1609 − "48 rows apart") and picked row 1579, which would have **clipped
PRESS START**. Reading the actual `PROMPT` constant is what caught it. The
usable window is 1589-1608.

⚠️ **AND THE SEAM HAD TO BE MEASURED, NOT EYEBALLED.** The first version
butted the band straight onto the plate and *looked* perfect in a 3x
screenshot — a pixel probe said otherwise: **a 7.8-level luminance step
across the join, against 0.3 on undisturbed road.** Well outside the sub-1
standard the landscape cut was held to. Then the seam step was measured for
every candidate row in the usable window and the flattest is only 2.22
(row 1592) — **nothing in that window is flat**, because the road under
PRESS START carries a real lighting gradient. (Rows reaching 0.01 exist, but
they are all inside PRESS START.)

So the join is **cross-faded rather than butted**: `BAND_FEATHER = 12` rows
where the rows that genuinely belong at that destination are laid back over
the top edge and faded out downward (`destination-out` + a linear gradient,
the only way to vary alpha under `drawImage`). The band therefore OPENS as an
exact continuation of the plate and has dissolved into the lifted content
well before the word arrives. Re-measured after: **worst row-to-row jump
across the join 23.15 against 26.75 on undisturbed road** — i.e. now *inside*
the plate's own dither rather than above it.

The correction is built **once, in the plate's own pixels**, into a cached
offscreen canvas — it depends only on the artwork, never on the window, so
nothing about it is redone when the phone rotates or the browser chrome
moves. Cached per image, because day and night are different plates.

Two more things the implementation has to get right:
- It runs on **every** frame including the intro's, so the word is never
  drawn in its unlifted place and there is no frame where it jumps.
- It takes the base's **own fade alpha and clears to black first**. The intro
  brings the plate up out of black (`introFx` — the base only fades, it never
  moves), so drawing the band over it at the same alpha would composite the
  shifted band on top of the unshifted one and **ghost a second OPTIONS**.
  Painting black then laying the band down at `alpha` reproduces the fade
  instead of doubling it — and because the feather's first row IS the
  original row, the two halves of the join stay identical at every alpha.

`HIT_MARGIN_TOP = 5` (against `HIT_MARGIN = 10` on the other three sides) is
the cost of the lift: OPTIONS moved into the gap under PRESS START, and since
everything that is *not* OPTIONS or MUSIC starts a run, a 10px top edge would
eat two thirds of the ~15px that is left and turn a thumb aimed at PRESS
START into an accidental trip to the leaderboard.

`titlefit.mjs` had to be told about this too — it checked painted row 1635,
which is now bare road, and would have passed while the word itself hung off
the bottom of the screen. It carries its own `OPTIONS_LIFT = 16` and checks
`1635 - OPTIONS_LIFT`. **Keep the two in step.**

Verified: titlefit 56/56, relaytod 26/26, musicbox 7/7, titleintro 6/6,
relay 8/8, panelnav 9/9, plus the seam probe above and screenshots at day and
night confirming PRESS START is uncut and the road reads continuous.

### ⚠️ THE SOUNDTRACK WAS SILENT ON EVERY PLATFORM, AND THE HARNESS SAID FINE

Client: *"when I click the button... it still doesn't trigger. It shows that
the speaker is live inside the browser area on my iPhone, but it doesn't play
the music."* It read like an iOS autoplay problem. It was not — it reproduced
in desktop Chromium immediately, and the cause was one character.

**`current = { slot, ...node }` in `audio/music.js`.** A spread COPIES, so
`current.gain` froze at whatever the gain was in that instant — and on a cold
load that is `null`, because the AudioContext has not been unlocked yet and
`graph()` has not run.

What then happened, measured end to end:
1. `tick()` woke the context a few hundred ms later and `graph()` built the
   real `GainNode` **on `node`**, initialising it from the element's volume —
   which was `0`, because the sound starts muted.
2. `current.gain` stayed `null` forever.
3. So every later ramp — `setMuted()` on the MUSIC tap, `duck()`, the `tick()`
   recovery — took the `else` branch and wrote `el.volume`, which does
   **nothing** once the element is routed through the graph.

The cue played perfectly into a gain of zero. Measured: element advancing
(`t=2.49`), `readyState 4`, `err=null`, gain node `0`, **master bus RMS
`0.000000`**. The element genuinely IS playing, which is what lights Safari's
audio indicator — and not one sample reaches the speaker.

Fixed by making `current` **be the node** (`slot` now lives on the node) so
every reader sees the live gain instead of a snapshot. Plus a cheap per-frame
assertion in `tick()`: a cue that is playing, unmuted, un-ducked and still
below half its intended gain gets re-ramped. The copy bug is gone, but the
*ordering* that exposed it — context waking mid-cue, between a build and a
ramp — is normal and will keep happening.

After: bus RMS **0.005 → 0.164** across the MUSIC tap, a 32× lift.

⚠️ **AND THE REAL LESSON IS THE HARNESS.** `musicbox.mjs` asserted
`!el.paused` — *"is the media element running"* — which stayed true for weeks
while the game was completely silent. **That is the wrong question.**
`audio.level()` (master-bus RMS) already existed for exactly this and was not
being used. The file now asserts:
- the bus is quiet before the tap,
- **the bus is loud after it** (`>0.02` and `>4×` the quiet floor),
- the cue's gain is not zero,
- the bus drops back on untick.

Two gotchas when reading `level()`: the analyser is built on FIRST call so the
first read is always `0` and must be discarded, and it is an instantaneous RMS
of a waveform, so **take a peak across ~40 frames** — a single sample can land
on a zero crossing. The harness also runs Chromium with
`--autoplay-policy=no-user-gesture-required`, which is what lets it observe a
cue that is "running but silent" at all.

**Never assert audio with `!paused` again.** It cannot distinguish a playing
song from a playing song at zero volume, and that distinction is the entire
bug.

### MUSIC now defaults OFF, and the box answers the press

Client: *"I want the music button off, and for it to acknowledge you clicking
it, and once it is clicked the user gesture should activate the theme song."*

`soundEnabled()` is now `=== 'on'` rather than `!== 'off'`. This is a
mechanism, not a preference: no browser releases sound before a real gesture
inside the page, and tapping a home-screen icon is a gesture on the OS, not on
us — so something here must be touched before the theme can ever start. A box
that is already ticked invites nobody to touch it, and the resulting silence
reads as broken. Unticked, the one press that turns music on is the same press
the browser accepts. Anyone who already chose `on` keeps it.

Because music no longer defaults on, the two unlock sites in `main.js` now
fire when **either** music or SFX is wanted — gating the unlock on music alone
would have left the effects dead too.

`drawMusic` takes a `pressAge` and throws a brief additive ring off the box
(cubic ease-out, ~20 ticks), drawn whichever way the box was toggled. The
press is stamped in `main.js` **before** any audio work, so the box
acknowledges the touch even if the audio path has a bad day — which is the
whole point, since a slow first buffer previously read as a dead button.

⚠️ `pausemenu.mjs` had four checks that quietly encoded "MUSIC starts ON" and
failed on this entirely-correct change. They are now **relative** — each
switch must flip itself and leave the other alone — which is what independence
actually means and is true whatever either one starts at. Prefer relative
assertions for anything with a default that might move.

### The pause menu, and splitting MUSIC from SOUND EFFECTS

Client: *"did you finish the pause menu, as well as being able to go back to
the main menu from the options and from the leaderboard?"* — against an
earlier list of *"checkboxes, no slider"* for music and effects and *"a
restart button on pause styled like Resume"*. The pause menu had been RESUME
and nothing else.

Now RESUME / RESTART / MAIN MENU, all the same shape (his instruction, so the
menu reads as one stack of choices rather than a main action with
afterthoughts), plus the two switches drawn as checkboxes underneath.

⚠️ **RESTART was removed once at his request and is back at his request** —
see the note in `drawPauseMenu`. The contest argument that justified removing
it does **not** actually stand against this version: MAIN MENU → PRESS START
already begins a fresh run from stage one, so RESTART is a shortcut for
something reachable in two taps anyway. It **abandons** the run rather than
scoring it, and nothing unfinished is ever submitted. What *would* break the
contest is a restart that KEPT the score — `pausemenu.mjs` asserts score 0 and
stage 0 after it, precisely so nobody later "fixes" it into a score-preserving
retry.

**The audio split is the risky half of this change.** `audio.setMuted()` used
to silence *everything*, and `wh_sound` was one master switch. There are now
two, independent end to end:
- `muted` / `wh_sound` → the MUSIC (the `<audio>` cues in `audio/music.js`).
- `sfxMuted` / `wh_sfx` → the effects, the UI cues **and the outdoor bed**.
  The ambience rides with the effects because it is scenery, not score.

`setMuted()` keeps its name and now only touches the music; `setSfxMuted()`
is new. Everything that is an effect (`play`, `powerUp`, `powerDown`,
`uiCue`, `startPending`, the `ambienceTick` early-out) gates on `sfxMuted`.
The **storage key `wh_sound` was deliberately left alone** — renaming it would
silently reset the preference of everyone who has already played.

The reasoning the client gave is worth keeping: most people at a party play
with the song off, and taking the song away should not also take the thump
that tells you a stomp landed.

The pause switches and the OPTIONS panel are **one setting seen from two
screens** — same helpers, so they cannot drift. The OPTIONS row formerly
labelled SOUND is now MUSIC, with SOUND EFFECTS added beside it.

### The leaderboard card was cut off at the top and could not be scrolled to

Client: *"the leaderboard is cut off at the top. Is it not internally
scrolling or what's going on? ... it's not cut off and it scrolls within
itself a little bit without a scroll bar."*

Not a sizing problem — a **centred flex item in a scroll container**.
`#panel` was `display:flex; align-items:center` *and* `overflow-y:auto`. When
the child grows taller than the container, centring overflows it **equally in
both directions**; the bottom half is reachable but the top half is not,
because `scrollTop` cannot go negative. His MARTA card is taller than a
phone, so the head of it — the `marta` wordmark and ATL 404 — sat above the
scroll origin with **no way to reach it at all**.

Fixed by moving the centring from the container to the item:
`align-items: flex-start` on `#panel`, `margin: auto` on `#panelCard`. An
auto margin still centres the card whenever there IS room and degrades to
top-aligned-and-fully-scrollable when there is not. Scrollbars hidden
(`scrollbar-width: none` + a zero-width `::-webkit-scrollbar`) per his "no
scroll bar".

Asserted in `pausemenu.mjs` rather than eyeballed: with `scrollTop = 0` the
card's top must be **at or below the panel's own top padding**. It measures
`cardTop=14` against `padTop=14` — exactly flush. A negative number there is
the bug returning, and the check also confirms the panel really is
overflowing (991 vs 732) so the assertion is not passing vacuously on a card
that happens to fit.

⚠️ **Do not "simplify" `#panel` back to `align-items: center`.** It looks
equivalent and re-breaks this immediately, silently, and only on short
phones.

New harness: `tools/harness/pausemenu.mjs` (13 checks) — the three buttons and
where each goes, the two switches proven INDEPENDENT in both directions,
persistence, OPTIONS agreeing with the pause menu, and the three scroll
assertions above.

### The board had no way out but a small ✕ in the corner

Client: *"when I pulled a leaderboard up, I have no way to get back to the
main screen cause it just takes me back to the settings... how can I get out
of options? How can I get out of the leaderboard? Do you look at that flow
in that logic and make sure it is standard?"*

`src/ui/panel.js` has three views — `board` (the leaderboard, and the panel's
HOME view: OPTIONS opens straight to it), `form` (contest sign-up) and
`settings` — and two of the three already had a labelled, bottom-of-card
`.btn.ghost` to step back: the form's NOT NOW and settings' BACK both call
`show('board')`. The board itself had nothing at that level — its only exit
was `#panelClose`, a small ✕ in the header, a different shape and place from
the other two. `#btnBoardClose` ("BACK TO GAME") in `index.html`'s `#pvBoard`
closes the same way ✕ does (`api.close()`), just where a thumb already
expects one after using the other two views.

Verified with a new harness, `tools/harness/panelnav.mjs` (9 checks): OPTIONS
opens to the board; SETTINGS and BACK step there and back; ENTER THE CONTEST
and NOT NOW do the same for the form; the new button closes the panel and
returns to the title; ✕ still closes from two levels deep (settings); the
game is still playable afterward.

⚠️ **The first version of this harness failed, and it was the harness, not
the app.** Reopening the panel with `page.touchscreen.tap()` a second time —
after buttons already existed at that same point on screen — landed on ENTER
THE CONTEST instead of opening fresh to the board. Traced with temporary
`console.log`s in `show()`/`open()`: `panel.open('board')` fired correctly
every time, immediately followed by an UNASKED-FOR `show('form')` from
`btnRegister`'s own click handler. Playwright's touch emulation fires a
touchstart/touchend AND a delayed synthesized mouse `click` at the same
coordinates; the first opens the panel (canvas `pointerdown`), and by the
time the synthesized click lands a moment later, a real button now sits at
that exact point and eats it. Switching the harness's re-open helper from
`touchscreen.tap()` to `mouse.click()` (one real click, nothing synthesized
after it) fixed the harness; the underlying navigation code was never wrong.
Worth remembering for any future harness that taps a coordinate a SECOND
time once new UI can appear there.

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

## The score ceiling, and why Will Hill sits at 50,000

**Measured 2026-08-14 by `tools/harness/ceiling.mjs`.** Re-run it after any
change to the per-stage bag quota, enemy rate, `CHAMPAGNE_SECONDS`,
`CHAMPAGNE_MULT` or stage length — all five move this table, and the pin is only defensible while the
table is true.

> **ENEMIES ARE NOT RATS.** Two different things, and an earlier draft of this
> section conflated them badly enough that the client caught it. The
> **enemies** (`level.enemies`, `entities/enemy.js`) are the masked hoodie
> figures — three palette variants, GDD "Enemy design", 50 points a stomp,
> 105 of them across the four stages. The **rats** are one scurrying sprite of
> undercroft scenery (`render/undercroft.js`, in the `kinds` list beside
> roots/conduit/sewer/manhole), they live only under the street, they cannot
> be touched and they score nothing. The word "rat" appears in this repo only
> in that scenery code. Do not let it back into a scoring table.

The harness walks all four shipping stages, forces every spawn with
`genAhead`, and then does the part that cannot be done on paper: it counts the
bags that **actually** fall inside each bottle's real window. The window is
9s at the measured 4.80 px/tick on a 16.6ms tick — **2,602px of road** — and
overlapping windows are unioned, because a bag cannot be doubled twice.

| stage | cols | bags (quota) | enemies | bottles | bags doubled (as placed / best possible) |
|---|---|---|---|---|---|
| eav | 360 | 90 | 21 | 2 | 44 / 54 |
| edgewood | 390 | 97 | 24 | 2 | 40 / 51 |
| underground | 420 | 103 | 27 | 2 | 40 / 54 |
| l5p | 450 | 110 | 33 | 2 | 40 / 55 |
| **total** | **1620** | **400** | **105** | **8** | **164 / 214** |

```
  400 bags at 100                              40,000
  105 masked enemies stomped at 50             +5,250
  ── flawless with no bottle at all             45,250
  164 bags doubled, bottles where they sit     +16,400
  ── PERFECT RUN, as the map is built           61,650
  214 doubled, bottles moved to the densest
     stretches (upper bound, not the game)     +21,400
  ── absolute ceiling if bottles were re-placed 66,650
```

### 400 is a quota, not a rate

Client, 2026-08-14: *"make it 400 bags total"* — so all the bags in the game
come to a round 40,000. It used to be `recipe.bag = 0.34`, a per-column dice
roll that **happened** to produce 379 and would have drifted the next time a
stage got longer or a hazard rate moved. Each stage now carries
`recipe.bags: <n>` and `generator.js wantsBag()` hits it by selection
sampling — take each candidate column with probability (owed / columns left).

Two things about that worth knowing before touching it:

- **Not every column can hold a bag.** Hazards get none, and a slab that draws
  a bottle gives its bag up to the bottle. `CANDIDATE_FRACTION = 0.74` corrects
  the denominator for that. It is a measured constant, not a derived one.
- **Sampling alone came up two short** — 89/90 on EAV, 109/110 on L5P — because
  the last stretch of road can run out of flat columns before it runs out of
  owed bags. `topUpBags()` spreads any shortfall back through the flat columns
  the sampler skipped. The harness asserts each stage's exact quota AND that
  neither half of a stage holds more than 60% of its bags, so a future change
  that hits 400 by dumping them all at the finish line fails the test.

**50,000 is 81% of the perfect run** (it was 85% at 379 bags). The line that
still matters is the middle one: a flawless run that never touches a bottle
tops out at **45,250**, so 50,000 **remains unreachable without the doubler**.
That property is the thing to protect — **past about 447 bags, bags alone
clear him and the champagne stops mattering at the top of the board.**

**The route to beat him**, since it is a specific one and not "play well":
all eight bottles, all 164 bags inside their windows, every enemy, and ~118 of
the 236 bags outside the windows (50%) — and no enemy touch late, because a
touch dumps the *entire* purse on the pavement (`main.js`, the Sonic-rings
branch) and anything not re-collected before it despawns is gone.

**Scale of the thing:** 32px per column, so the four stages are 51,264px of
road. Running flat out and stopping for nothing that is **2m 58s**; a real
collecting run with the three rides is more like 6–8 minutes.

The card art paints **125,680** beside his name. That was always decoration —
double the absolute ceiling — and the board draws 50,000 over it.

---

## Still open

- **Daytime multiplane — DONE for all four stages.** Every day plate is now
  cut and wired: eav-day 10 cards, edgewood-day 15, l5p-day 17, plus
  underground-day's existing 19. See "Day and night" above.
- **The repeat seam — see "The repeat seam" above.** The night half is done and
  measured; three day joins remain above their plate's own noise floor, and the
  reason a pixel operation cannot close them is written up there.
- **CREDITS — the client's own wording, captured verbatim so it is not lost.**
  Music by prodbyKCTW. Sound effects by prodbyKCTW. Game design credit to
  Chemo: she picked the images — went online and found the reference for the
  other stages, and after they were selected together she ran them through
  ChatGPT to stylise them, so she designed the backgrounds, the character and
  the ninja enemies. He picked the map and directed the styling; everything
  else is his, from scratch, his own decisions. Put this on the credits screen
  when the two logo files land.
- **End-credits sequence.** The ending SCREEN is built (his painting, real
  stats, swaying crowd). The credits that share the frame with it are not, and
  are blocked on files that have only ever been in chat: the RARƎ AGENCY logo
  and prodbyKCTW's logo.
- **The ten soundtrack cues are WIRED and playing** — prodbyKCTW's own
  instrumentals, not the Will Hill tracks the original sheet named. See "The
  soundtrack" below. The Will Hill songs can still land later: the slots are
  keyed by function, so each swap is one manifest line.
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
- **`credits` runs out and the ending goes quiet.** Measured durations, all
  ten cues: title 1:26, stage_01 1:36, stage_02 1:39, stage_03 1:42, stage_04
  1:38, map_01_02 0:44, map_02_03 0:47, map_03_04 0:48, ui_pause 1:18,
  **credits 0:41**. Every other cue loops and every stage is 40–49s of road,
  so no stage cue even reaches its loop point — that half is comfortable. But
  `credits` is deliberately `loop: false` ("the one cue that plays start to
  finish") and the `complete` screen has no time limit, so a player who sits
  on the ending past 41s sits in silence. Three ways out: loop it, fade the
  screen out with the track, or get a longer cue. **The client's call — it is
  a music decision, not a bug.**
- **The clouds are not cut out of the portrait title.** Every other element is
  (`tp_logo`, `tp_signL`, `tp_signR`, `tp_hero`, `tp_pole`), so the clouds do
  not slide in with the rest the way he asked. SAM merges them into the sky —
  they have no edge it can find — so this needs a colour key rather than a
  mask, which is a different tool from `sam_segment.py`.
- **The leaderboard rows are monospace, not a pixel font.** His MARTA card is
  hand-lettered and the fallback does not match it. Any real pixel face is a
  licence question, so it is a decision before it is a job.
- **The bag count is now a quota, and it has a ceiling of its own.** 400 is
  set (90/97/103/110). Anything past ~447 bags puts 50,000 inside reach on
  bags alone and makes the champagne irrelevant at the top of the board — see
  "400 is a quota, not a rate" above.
- **The branch is well ahead of `main`.** `claude/last-markdown-game-link-lvk1n6`
  carries everything from the day plates forward; `main` is still at
  "CHAMPAGNE RELAY on the title card". Merging is authorised, not automatic.

### Corrected — these were listed as open and are DONE

Left here because a stale "still open" list already cost this project a
session of re-doing finished work.

- **Roll/hit/death clips exist.** The player atlas carries all twelve: death,
  fall, hit, idle, jog, jumpLand, jumpStart, knockback, knockdown, roll, run,
  walk.
- **The MARTA map is built** — `src/render/martamap.js`, on the client's own
  rail map, with station coordinates measured by ring centroid and the train
  following the polyline by arc length.
- **All four day plates are cut into multiplane cards**, with the same card
  names, depths and sway constants as their night twins.
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

## ⚠️ THE CONTAINER ROLLS BACK. ORIGIN IS THE ONLY TRUTH.

**This happened three times on 2026-08-14 alone**, and once the day before.
The remote container's working copy silently reverted to an older commit
(`dff3d1e` every time) mid-session — no error, no warning. Files written
minutes earlier were simply gone, and `git log` showed a HEAD from hours back.

**Nothing was lost, because everything had been pushed.** That is the entire
mitigation, and it is not optional:

- **Commit and push after every finished piece of work**, not at the end of a
  session. A push takes two seconds; re-deriving a day of measurements does
  not.
- **Harnesses live in `tools/harness/`, committed** — never in `/tmp` or the
  scratchpad. An earlier rollback destroyed a set of scratch harnesses and
  they had to be rewritten from memory. That is why they are in the repo now
  even though they are test code.
- **Recovery is one command**, and it is safe precisely because origin is
  ahead: `git fetch origin <branch> && git reset --hard origin/<branch>`.
- **Check first, then trust.** `git log --oneline -3` at the start of any
  session, and again any time a file you know you wrote is missing. Do not
  assume the checkout matches what you remember — it did not, three times.

If a session starts and HEAD is not where this document's history says it
should be, the checkout is stale, not the branch.

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

**The tightest version of that, and worth the extra minute for anything the
client will judge by eye:** extract the branch that was actually pushed and
serve *those* bytes.

```bash
git fetch origin gh-pages && git archive origin/gh-pages | tar -x -C ghp/
sha256sum ghp/assets/index-<hash>.js
curl -s <live>/assets/index-<hash>.js | sha256sum      # must match
(cd ghp && python3 -m http.server 5200)                # paths are relative, root is fine
```

Now the harness is driving the deployed artefact, byte for byte, and the only
thing left unverified is Pages' CDN. Measure the canvas directly rather than
decoding a screenshot — `getImageData` on the top third gives a mean luma in
one `evaluate`, and there is no `pngjs` in this tree. Day vs night on the
shipped bundle reads **93.0 vs 30.1**, a 3.1× split; anything near 1× means the
setting is not reaching the pixels.


---

## The second idle — Will Hill counts his money

**Wired and tested; waiting only on the sheet.** Stand still for 200 ticks
(3.3s) and `stepPlayer` switches `anim` to `idleFlex`; move, jump or take a hit
and it drops on the same tick and the wait restarts from zero. Proven by
`tools/harness/idleflex.mjs`, 8/8, against the real gate with a stand-in clip
injected into the atlas before player.js reads it.

**It is gated on the clip existing** (`HAS_FLEX`, read once at module load), so
today's build behaves exactly as it always has. Without that gate `anim` would
flip to a clip the sheet lacks — `resolveClip` would draw the right thing, but
`advanceAnim` resets `animT` on every change of key, so the breathing idle
would snap to frame 0 every few seconds forever. The harness watches 150 frames
for exactly that and counts zero early resets.

### To install it

1. Generate the sheet (below).
2. Compose it into `will-hill.webp` with `tools/compose_player_sheet.py`.
3. Add an `idleFlex` entry to `will-hill.atlas.json` — same shape as `idle`:
   `{ "start": <first frame>, "frameCount": N, "loop": true, "ticks": ~5, "fit": {...} }`.

No code change. It starts working on the next load.

### The animation, in the client's words

> "When Will Hill is just standing idle I want him to start thumbing through his
> money roll — counting money as one of the idle motions." … "He should be
> thumbing through his money roll. If you need to look up images of rappers
> thumbing through the check, as it's referred to, do that so you can get the
> proper aesthetic. It's a stylized way of counting your money as a simple life
> achievement in urban hip-hop culture."

The motion, so whoever writes the prompt does not get a bank-teller counting
notes flat on a desk: a **thick folded roll of bills held in one hand**, thumb
riding the top edge and flicking the corners so they fan and snap back, wrist
doing most of the work, the other hand loose at his side or tucked. **He is not
looking at it** much — the flex is that he does not need to count carefully.
Small nod or shoulder roll on the beat. Loops seamlessly, and the roll never
leaves his hand.

### The AutoSprite call, ready to fire

```
generate_spritesheet({
  characterId: <the existing Will Hill character>,
  animations: [{
    kind: 'custom',
    name: 'idleFlex',
    loop: true,
    prompt: 'standing still, holding a thick folded roll of cash in one hand, '
          + 'thumb flicking down the edge of the bills so the corners fan and '
          + 'snap back, wrist doing the work, other hand loose at his side, '
          + 'casual and unhurried, barely glancing at the money, small nod on '
          + 'the beat, feet planted, seamless loop',
  }],
  spritesheet: { frameCount: 32, frameSize: 256 },
})
```

`frameCount: 32` and `frameSize: 256` match what the rest of this atlas was cut
from (`sourceCellSize` 256x256, `idle` is 32 frames). Do **not** set
`withSound` — it costs extra credits and this clip is silent.

### ⚠️ AutoSprite is refusing calls in this environment

Measured, not assumed — two different endpoints, same answer:

```
list_characters → Unauthorized: provide an MCP API key from https://www.autosprite.io/apikey.
get_account     → Unauthorized: provide an MCP API key.
```

The server is REACHABLE — that is its own structured error coming back, not a
timeout or a missing tool — so this is not a network problem and not a dead
account. It is that no key is being presented on the connection. Generating a
key at autosprite.io does not by itself attach it to anything; it has to be
pasted into the AutoSprite connector's settings on the claude.ai side. Until
then this session cannot generate the sheet.
