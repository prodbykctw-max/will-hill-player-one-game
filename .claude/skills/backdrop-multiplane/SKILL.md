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
5. **`cut_planes.py <stage>`** — cuts the cards, inpaints the base plate.
6. **`preview_planes.py <stage>`** — recompose check. Base + every card at zero
   offset must reproduce the original. Under 0.1% is good.

## Hard-won rules

- **SAM finds, it does not rank.** It has no idea about depth. Something still
  has to say "that is the tree, it goes at 0.81". Do not expect it to.
- **Keep the rate spread TINY.** `DEPTH_SPREAD = 0.010` around a common base
  rate, with a hard separation clamp. A wide spread does not read as depth, it
  reads as the set falling over — and because cards wrap on their own phase, a
  fast card migrates a whole plate width across a level. The tree that starts
  the stage on the left ends it on the right. The target is the lenticular
  effect: small enough that nothing distorts.
- **Assign masks by CONTAINMENT, not centroid.** 70% of pixels inside the
  region. A centroid rule put the sky on a column card, because the sky's
  centroid happens to land in the column's box.
- **The sky is never a card.** It is the background every silhouette is cut
  against, and it is already the base plate.
- **Seed the sky flood-fill a few px in from the frame edge.** Plates often
  vignette to black, which fails any blue-dominance test, and seeding from
  row 0 then finds no sky at all.
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
  Raising the sampling grid is not the fix and will fool you into thinking it
  is: 28 -> 48 moved coverage 85.0% -> 86.0% while the letters stayed gone.
  Lowering the area floor and the confidence bar is what finds them.
- **Sub-masks are for glow, not for drawing.** A dense pass returns hundreds
  of masks — every window, every bulb. That is the right detail to HAVE and
  the wrong number of things to DRAW. Group into ~12 cards; keep the rest on
  disk for the lighting pass.
- **Things that hold each other up must stay close in depth.** Columns
  supporting an arch shear apart otherwise.
- **Sway is per-card**, pivoted at the bottom of the moving mass, so trunks
  stay still and only leaves move. Subdivide within each window — shearing a
  whole card about one pivot makes a tree lean like the rigid cutout it is.

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
