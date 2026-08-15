---
name: backdrop-multiplane
description: Cut a flat backdrop image into per-item parallax cards so it reads as a space instead of a picture. Use when a 2D game backdrop needs depth, when isolating individual objects out of artwork for independent animation or glow, or when someone asks for a multiplane/pseudo-3D/South-Park-cutout background effect.
---

# Multiplane backdrops

Turn one flat plate into a stack of cut-out cards, each drawn at its own rate,
so the backdrop reads as a space. Built and proven on Will Hill: Player One.

## The model

Cardboard cutouts, not sliced bands. Old South Park sets: every item is a
whole clean piece of card, and the pieces sit on top of one another. Move one
and what shows behind it is the next piece, complete. Nothing is a rectangular
chunk of a bigger picture and nothing has a bite taken out of it.

**Horizontal bands are the wrong answer** and will be rejected. So will
disjoint rectangular planes — they work, and they read as hard cuts.

## Pipeline

1. **`sam_segment.py <stage>`** — Segment Anything outlines every item. It is
   class-agnostic, so it never needs to know what a "Citgo canopy" is. Writes a
   numbered proposal sheet. **Finds text by default** — see below.
2. **`sam_coverage.py <stage>`** — the check that matters. Renders what SAM
   *missed*, scored by local contrast so flat sky does not count as a miss.
   Looking only at what it found will not tell you the letters are gone.
3. **`sam_group.py <stage>`** — folds N masks into ~a dozen depth cards by
   region.
4. **`sam_segment.py <stage> --emit`** — freezes the chosen masks as committed
   1-bit PNGs (a few kB each).
5. **`cut_planes.py <stage>`** — cuts the cards. ⚠️ **It does NOT touch the
   base.** Items used to be erased from the plate and the hole inpainted, on
   the theory that an item otherwise appears twice once its rate diverges.
   That is only true if it diverges FAR, and it does not — 72px at most across
   a whole stage. What the fill actually bought was a blurred grey patch behind
   every card, 10-30 levels off the art, which the client named on sight:
   *"bruises everywhere on the game."* The base stays the whole painting.
6. **`preview_planes.py <stage>`** — recompose check. Base + every card at zero
   offset must reproduce the original. Under 0.1% is good. ⚠️ Trust it for the
   RECOMPOSE only unless its parallax constants match the renderer's — this
   one drifted a whole generation behind (hard 90px wall vs the shipped 16px
   tanh ease, base at depth 0 vs neutral, no drift) and previewed a law that
   no longer existed. A verification tool that models the dead law grades its
   own memory, not the game.

## Hard-won rules

- **SAM finds, it does not rank.** It has no idea about depth. Something still
  has to say "that is the tree, it goes at 0.81". Do not expect it to.
- **Keep the rate spread TINY.** `DEPTH_SPREAD = 0.010` around a common base
  rate, with a hard separation clamp. A wide spread does not read as depth, it
  reads as the set falling over — and because cards wrap on their own phase, a
  fast card migrates a whole plate width across a level. The tree that starts
  the stage on the left ends it on the right. The target is the lenticular
  effect: small enough that nothing distorts.
- **⚠️ SEPARATION IS NOT DRIFT-FROM-HOME, IT IS DOUBLE VISION.** The base plate
  is the FULL painting — it still carries its own copy of every item the cards
  re-draw (measured: a card's opaque pixels are 99–100% identical to the base
  underneath). So every pixel a card moves off its base copy prints the item
  **twice**. Alpha holes make it worse: the gaps between fence planks show the
  base's copy of the same fence, offset. Two things keep it under the reading
  threshold — draw the base at NEUTRAL depth (mid-stack, not 0) so the error
  splits between near and far cards instead of the base walking away from all
  of them, and make the clamp a **tanh ease rather than a wall**, so cards slow
  into the bound and the relative shear between neighbours compresses instead
  of accumulating. 16px of double reads as paint thickness; 34px reads as a
  second fence, and the client photographed exactly that.
- **It only shows in daylight.** The same offsets sat in the night plates for
  weeks. Dark planks have no contrast to read a double edge against. Do not
  conclude a layering bug is absent because the night stage looks fine.
- **Assign masks by CONTAINMENT, not centroid.** 70% of pixels inside the
  region. A centroid rule put the sky on a column card, because the sky's
  centroid happens to land in the column's box.
- **Repeat the plate straight, never mirrored.** Mirroring is the classic way
  to hide a seam on a non-tiling image, and it is wrong for real streetscapes:
  a flipped copy renders every sign backwards. Repeating the block instead is
  the old cartoon running-past-the-same-background gag and keeps the signage
  readable.
- **The sky is never a card.** It is the background every silhouette is cut
  against, and it is already the base plate.
- **Seed the sky flood from the top FOUR rows, not row 0.** The reason is
  mechanical, not artistic: erosion treats the image border as background, so
  row 0 of the eroded core is always empty and a single-row seed finds no sky
  at all. Take a band.
- **⚠️ The flood must not be allowed to travel through cloud-ish pixels.**
  Letting it pass anything pale as well as anything blue let it cross the EAV
  Swifty sign's white frame and escape into the artwork — the flood leaves the
  sky entirely and starts eating the painting. Blue-and-bright-enough only, and
  cloud is a SEED test, never a travel permit.
- **⚠️ …and blue-only travel is still not enough: ERODE BY 1 BEFORE FLOODING.**
  Anti-aliased pixels where a sign frame meets both sky and sign face form
  **1px blue bridges**, and the flood crossed one on the same Swifty sign even
  after the rule above — the sign face scanned as sky, which is how CAR WASH
  became seven clouds. Eroding by one cuts every 1px bridge; follow with ONE
  **constrained** dilation (re-intersected with blue, never a plain dilate),
  which recovers the true sky rim without re-crossing a barrier — a single
  step can only re-touch the bridge pixel, not flood a face.
- **The last line of defence is TONE, not colour.** A frameless sign face
  meeting open sky gives the flood mask nothing to hold onto — no colour test
  separates them. What does: compare each candidate blob's ring against the
  **sky's own median value on that blob's rows**, sampled outside its
  neighbourhood. A ring reading **≥0.09 darker** is a painted pocket, not sky,
  and the blob is a letter, not a cloud (`tools/scrub_stage_clouds.py`).
- **Per-stage colour thresholds, always re-measured.** They do not transfer
  between plates. Score every candidate rule two ways: what fraction of a
  verified sample it catches, AND what fraction of the foreground it wrongly
  claims. A rule that scores well on the first and badly on the second is not
  a sky rule, it is a darkness rule.
- **LETTERING MUST ALWAYS COME OUT. This is not an option to remember.**
  SAM's stock thresholds are tuned to return objects and they silently drop
  text — CITGO, WELCOME TO EAST ATLANTA, CRIMINAL RECORDS, the McDonald's
  sign. On a game built from real storefronts, signage is not an edge case,
  it is most of what is worth isolating, and a client will spot a missing
  letter immediately. So the low thresholds are the DEFAULT
  (`pred_iou 0.68`, `stability 0.80`, `min_region 60`, area floor 80px) and
  a `--coarse` flag opts out for a quick structural pass, never the reverse.
  ⚠️ In practice the default is a **two-pass cascade** — a structural pass and
  a fine pass merged — not one run at low thresholds. Quoting the numbers
  without the cascade will send someone chasing a single-pass config that never
  finds the letters.
  Raising the sampling grid is not the fix and will fool you into thinking it
  is: 28 -> 48 moved coverage 85.0% -> 86.0% while the letters stayed gone.
  Lowering the area floor and the confidence bar is what finds them.
- **Sub-masks are for glow, not for drawing.** A dense pass returns hundreds
  of masks — every window, every bulb. That is the right detail to HAVE and
  the wrong number of things to DRAW. Group into ~12 cards; keep the rest on
  disk for the lighting pass.
- **Things that hold each other up must stay close in depth.** Columns
  supporting an arch shear apart otherwise.
- **⚠️ A GROUND STRIP IS NOT FEATURELESS, AND GIVING IT ITS OWN RATE COST MORE
  THAN ANY OTHER MISTAKE HERE.** The argument for the exception went: the clamp
  exists to stop a discrete OBJECT migrating, and a verge or a kerb is a
  continuous band with no landmark inside it, so slide it 300px and there is
  nothing to notice having moved. Every word of that is true except
  "featureless" — a strip has no landmark inside it but it has **a hard edge
  along the top, and things stand on that edge**. At rate 0.30 against the
  plate's 0.10 the strip saturated its 400px clamp about 200px into the stage
  while the fence planted in it, depth-derived, had travelled 20px. Measured at
  the far end: verge +400, fence +20. **380px of shear on a 430px screen — the
  grass walks out from under the fence.** The control experiment was already in
  the table: the one ground strip that never got an override is the backdrop
  the client called perfect. No strip rates, no strip clamps; depth drives
  every card.
- **Sway is per-card**, pivoted at the bottom of the moving mass, so trunks
  stay still and only leaves move. Subdivide within each window — shearing a
  whole card about one pivot makes a tree lean like the rigid cutout it is.

## Weather: a card that MOVES ON ITS OWN

Parallax is a function of where the camera is, so a cloud card only slides
while the player runs — stand still and the sky is a photograph. Give the card
a `drift` in **screen** px per tick — not source px; the two differ by the
plate's zoom and everything in `cardParallax` is screen space — and it moves
forever without a seam, because the plate is already wrapped.

That one change opens the longest-running bug on this project. The client
reported it for a week in a row and every one of my first four diagnoses was
wrong. Read this section before touching drifting weather.

**The symptom:** a cloud passing a tower is visible in front of part of the
tower and hidden behind the rest. The client's words: *"a cloud that goes
partially behind the building and partially in front of a building looks like
it's going through the building, like inside the building."*

**Wrong diagnosis #1 — the far/near flag.** I went looking for clouds assigned
to the wrong plane. There is no such bug available: a card is drawn either
before or after the structure card, so it is *wholly* behind or *wholly* in
front. A flag cannot make one cloud do both. The client corrected me on this
directly. **Partly-behind-and-partly-in-front always means the SILHOUETTE HAS
GAPS**, never that the ordering is wrong.

**Wrong diagnosis #2 — enclosed holes.** Filling holes fully surrounded by
structure (126 of them, 5,390px) is real but is half the problem. A gap that
reaches open sky is not enclosed, so a hole-filler never sees it, and a cloud
crossing one emerges mid-face exactly as described.

**Wrong diagnosis #3 — sky-connected gaps.** Better, still wrong, and this is
where the client out-diagnosed me: *"the dark side of the building, that long
shadow strip going down the building, is treating that like it's something
separate."*

He was exactly right, and it is the rule worth carrying to every project:

> **⚠️ A SKY FLOOD RUNS DOWN A BUILDING'S SHADOWED FACE.** The dark side of a
> building is painted dark BLUE, and it meets open sky at the roofline. A flood
> that only asks "is this blue" pours in at the roof and marks the whole strip
> as sky, so it never gets sealed and the weather stays visible all the way
> down it. **Put a brightness floor on the flood.** Measured on one plate:
> 30,494px (17.6%) of what the flood called sky was darker than 0.40, while
> real sky sat at 0.596–0.694. Two clean populations, nothing between the 10th
> percentile (0.333) and the 25th (0.596) — so a floor of 0.50 lands in the
> empty gap and cannot cut into real sky. **Measure the gap on your own plate;
> do not inherit 0.50.**

### The three tools, by name

The technique above is spread across three scripts and the skill described it
without naming any of them:

- **`scrub_stage_clouds.py`** — lifts the clouds OFF the base onto their own
  card and repaints sky behind them.
- **`seal_stage_clouds.py`** — writes `<stage>-skystruct.webp`, the sky band's
  structure in the base's own pixels.
- **`seal_skyline.py`** — the same job for the title plate, whose card is one
  skyline silhouette rather than a band.

⚠️ **And the FIRST failure came before any of them.** The day cloud cards were
originally cut as *a band of sky with clouds in it* rather than the clouds
alone. A rectangle of sky drifting over a plate does two visible things the
client reported immediately: it drags a slab of slightly-wrong blue across the
real sky, and its edges wipe over whatever they cross. **Cut the weather, not
the region the weather is in.**

### Sealing the sky band

The fix is a `skystruct` card: the sky band's structure carrying **the base
plate's own pixels**, declared at exactly the base's depth so it registers with
its copy underneath to the pixel, drawn after the weather.

> ⚠️ **DRAW ORDER IS ARRAY ORDER, NOT DEPTH.** `drawCards` iterates the card
> list in the order it is written; `depth` only sets the RATE. A reader will
> reasonably assume the stack sorts itself by depth and it does not — the seal
> works because `skystruct` is listed AFTER `clouds`, and moving the line moves
> the fix. Depth 0.5 buys registration with the base; the array position buys
> occlusion. Two different jobs from two different fields. No repainting, no
inpainting, no invention — a hole is filled with the base's pixel at that
coordinate, so the static picture is bit-for-bit what it was and the only
difference is that a cloud can no longer be seen through it.

Three more traps, all of which bit:

- **Trust no other card's footprint.** My seal took credit for coverage from
  every other card in the stage. Cards parallax up to `MAX_SEPARATION` off the
  base — that is the entire point of the multiplane — so along every card's
  edge is a strip that its footprint claims and the card does not actually
  cover. Seal the whole band and trust nothing.
- **"Bright and unsaturated" is a cloud, and it is also the pale stone pier
  between two windows.** Excluding it cost 41,406px of one facade, in vertical
  strips between window bays, which is precisely where the leak was. Tell them
  apart by **what surrounds the blob**, a blob at a time: the fraction of its
  3px ring that is open sky, and the fraction that is black keyline. Measured
  across four plates, clouds ran 0.50–0.76 sky-ring and 0.00–0.10 dark-ring;
  structure ran 0.00–0.11 and 0.14–0.93. Comic-style art outlines every object
  in ink and never outlines weather, which is what makes the second test work.
  **Where the two disagree, SEAL** — a cloud sealed by mistake merely stops
  drifting; a building freed by mistake is the bug.
- **Do not over-seal, or you kill the weather.** Sealing everything that is not
  sky swallows the clouds still painted into the plate, and the drifting ones
  then hide behind them: one stage went to **9px of moving cloud on screen**.
  Grade both directions or you will trade one complaint for the opposite one.

### Sealing is visually free — except where the renderer post-processes

The seal draws the base's own pixels at the base's own rate, so it cannot
double against anything, including a swaying card. I wasted a pass being
cautious about that.

It is **not** free where the renderer does something to the plate that it does
not do to the cards. Here that was the top **feather** — the gradient that
dissolves the plate's crop line into the sky. It faded the base only; cards
drew over it at full strength, and a fully sealed band restored a hard
horizontal cut across the frame. **Fade the COMPOSITE, after the cards, not one
layer of it.** That is what the gradient was always for, and it improved every
stage, including ones that had shipped:

```
day    57.7 -> 2.9   37.1 -> 1.9   69.1 -> 2.2   22.6 -> 1.7
night   8.6 -> 2.2   12.2 -> 2.0    4.0 -> 2.0    3.1 -> 1.9
```

### How to measure weather occlusion in the running game

> **Reference implementation: `tools/harness/cloudseal.mjs`.** The method below
> lived only in prose for a while, which meant the most expensive bug on the
> project had no regression test. It is a graded harness now, and it carries a
> `CLOUDSEAL_BREAK=1` self-test that strips the seal back out to prove the
> check can actually fail.

Offline arithmetic proves the card covers the structure. It does not prove the
card is wired, spanned and depthed correctly. Measure the rendered frame:

1. **Draw the frame twice — with the weather card, and with it removed. The
   difference IS the weather.** No colour-keying, no guessing which pixels are
   cloud.
2. **Capture the noise.** Draw the clouds-off state *twice* and subtract what
   changes between the two — idle animation, a HUD timer, swaying cards. One
   pair is not enough if anything cycles: take the union across every sample.
   Skipping this reported a player's own trousers as a cloud (236px, rows
   508–569 — his sprite box on every stage).
3. **Scope to where a cloud can be.** Below the lowest sky pixel in the frame
   there is no weather, and a real crossing always has cloud in open air right
   beside it.
4. **⚠️ Parking the player off-screen starts a death loop.** At y=-40000 he
   falls, dies, respawns and the camera snaps — forever. Pairs came back
   279,503px apart at some ticks and 3,000 at others, which is not cloud, it is
   the phase of that loop. For a weather measurement just leave him at spawn:
   he stands still and the sky above him is nobody's business. Where a harness
   genuinely must walk him across a whole stage, the loop has to be defeated on
   purpose — re-state `hearts` and `screen` on EVERY step, which is what
   `stagesweep.mjs` does. It is a pattern, not a prohibition.
5. **Sweep a whole drift period for VISIBILITY too**, not just for leaks. At
   0.035px/tick against a ~1500px period that is ~43,000 ticks — twelve minutes
   of play — so a six-sample window near tick 0 tells you almost nothing.

## Determinism, or the measurement is worthless

`page.screenshot()` is not synchronised to the game loop: the tick increments
between being set and the frame being taken, and **two identical runs differed
by 12,384px**. Re-pin the tick across three frames and read
`canvas.toDataURL()` inside ONE `page.evaluate`. Before/after numbers taken any
other way are noise with a decimal point.

## NumPy trap that cost real time

`_chan()` returning int16 silently corrupts every luminance test: under NumPy
2's scalar rules an int16 array times a Python int stays int16, so
`r*299 + g*587 + b*114` overflows for any red above 109 and wraps negative.
It measured 37.5% of pixels wrong, made one rule match zero pixels ever, and
made another claim 313k pixels of bright art as unlit black — which showed up
in game as a fence with its planks chewed to lace. **Use int32.**

## Verify by measuring, never by eyeballing

Reading coordinates off a downscaled screenshot produced wrong numbers
repeatedly on this project. Locate items by colour signature and connected
components, trace edges by detecting them per column, and check the result
with the recompose diff. Every time this pipeline guessed instead of
measuring, it guessed wrong.

## Mistakes this pipeline already made

Full write-up in `docs/LESSONS.md`. The ones that will bite again:

- **Measure, never read coordinates off a scaled screenshot.** Displayed
  pixel positions are not the labelled coordinates, and reading them as such
  produced wrong item positions twice. Locate by colour signature and
  connected components instead.
- **Check the negative space.** Reviewing a segmentation by its proposal
  sheet only ever shows what was found. Render the complement or you will
  ship missing letters.
- **Verify a change could have failed.** A rule was "fixed" by lowering a
  threshold when the rule matched zero pixels either way, and that was
  believed for days.
- **Look at the assignment map BEFORE wiring anything.** Two cards were cut
  and wired as solid rectangles — the exact failure mode this pipeline
  exists to avoid.
- **Correctness before scale.** A wide rate spread and full-frame blits both
  shipped as regressions before being dialled back.
- **"I can't" is a claim too.** Before saying something is impossible,
  unsupported, or the user's job — go read the config, call the tool, read
  the actual error. Being right by luck still costs an argument.
