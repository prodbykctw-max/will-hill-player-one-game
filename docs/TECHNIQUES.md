# Techniques — a portable breakdown

Every technique used to build **Will Hill: Player One**, written so it can be
lifted into another game. Concepts and real numbers, not this project's file
paths. Where a number appears it was **measured on this project**, so it is a
starting point that is known to work rather than a guess.

Written for prodbyKCTW, who came up with the usages these implement.

Contents:
1. Pseudo-3D depth — the multiplane backdrop
2. Cutting a flat image into depth layers
3. Ground contact across mismatched sprite projections
4. Animation cycles — the trap that eats weeks
5. Character feel — two-gear locomotion, air control
6. The world map interstitial
7. Procedural effects instead of sprite sheets
8. Audio without shipping megabytes
9. Anti-cheat scoring
10. The verification habit that made all of it work

---

## 1. Pseudo-3D depth — the multiplane backdrop

**The idea is 1937.** Disney's multiplane camera put artwork on separate glass
panes at different distances and moved them at different speeds. Everything
below is that, in 2D.

**The mental model that works: cardboard cutouts.** Old South Park sets —
every item is a whole, clean piece of card, and pieces sit on top of one
another. Move one and what shows behind it is the next piece, *complete*.

Three things that DON'T work, all tried:

| approach | why it fails |
|---|---|
| horizontal bands | slices straight through objects |
| boxes / rectangular planes | works, but boundaries read as hard cuts |
| hand-traced curves | a drawn line never lands on the real edge |

### The rate spread is the whole trick, and it must be TINY

Every card scrolls at one shared base rate. Depth adds only a small
**difference** on top:

```
diff   = camX * (depth - BASE_DEPTH) * SPREAD     BASE_DEPTH = 0.5, SPREAD = 0.010
offset = camX * PLATE + SEP * tanh(diff / SEP)    PLATE = 0.10, SEP = 16
```

Two refinements the fence doubling forced (the base plate still carries its
own copy of every carded item, so every pixel a card moves off that copy
prints the item twice): the base draws at **neutral depth** so the error
splits between near and far cards instead of the base walking away from the
whole deck, and the clamp is a **tanh ease, not a wall** — cards slow into
the bound, and near saturation the relative shear between neighbours
compresses instead of accumulating. 16px of double reads as paint thickness;
34px read as a second fence, and the client photographed it.

A wide spread (0.02 → 0.62 was tried) does **not** read as depth. It reads as
the set falling over: cards slide off each other and the empty plate shows
through. Worse — each card wraps on its own phase, so a fast card drifts a
whole plate width across a level. *The tree that starts the stage on the left
finishes it on the right.* That is not parallax.

At 0.010 the nearest card stays within ~77px of home across a 7680px stage.
**The target is the lenticular effect** — those prints that look 3D when you
tilt them. The shift is small enough that nothing distorts, and depth comes
from *relative* rates, not distance travelled.

`SEP` is the backstop that makes migration impossible even if someone dials
the spread up later.

### ⚠️ There are NO exceptions — the ground-strip one was removed, expensively

This section used to teach the opposite: give a verge, kerb or street band a
real rate (0.30 against the plate's 0.10) and a looser clamp, on the argument
that a featureless full-width band has no landmark to be seen moving. **Every
word of that is true except "featureless."** A strip has no landmark inside
it, but it has a hard edge along the TOP, and things stand on that edge. At
0.30 the strip saturated its loose clamp ~200px into the stage while the
fence planted in it travelled 20px — measured at the far end of EAV: verge
+400, fence +20. **380px of shear on a 430px screen; the grass walks out from
under the fence.** Client: "it moved cool, it's just not visually looking
right." The control experiment was already in the stage table — the one strip
that never got the override is the backdrop he called perfect. Depth drives
every card; no strip rates, no strip clamps.

### Detail cards buy GLOW, not depth

Lettering, neon, signage lifted off the wall they are painted on will **never**
read as parallax — a sign flush against a wall has no gap between it and the
wall. Lift them anyway, for independent lighting, and pin each one a
hundredth of depth from its parent so it cannot visibly slide.

### Sway must be per-card and pivoted low

Shearing a whole card about one pivot makes a tree lean like the rigid cutout
it is. What reads as foliage is many small sections of the crown drifting out
of step, subdivided *within* each window. Put the pivot at the **bottom of the
moving mass** — shear is zero at the pivot and grows upward, so trunks stay
dead still and only leaves move.

---

## 2. Cutting a flat image into depth layers

### Let a model find the objects

**Segment Anything (SAM)**, Meta, 2023. Class-agnostic — it never needs to
know what a "gas station canopy" is, it just finds coherent regions and
outlines them per pixel. `pip install segment-anything`, ViT-B checkpoint is
375MB and runs on CPU.

What it does **not** do is depth. It will hand you 200 masks and something
still has to say *that one is the tree, it goes at 0.81.*

Alternatives and why they lose: Mask R-CNN only knows its 80 trained classes;
rembg gives one foreground; GrabCut needs you to say where each item is.

### Two passes, coarse then fine, merged

One pass cannot do both jobs. Coarse settings return whole objects with clean
outlines and **silently drop lettering**. Fine settings find a 9px-wide letter
but fragment a facade into forty bricks.

Run both, keep every coarse mask, and add a fine mask only if it is not
already saying the same thing (IoU < 0.75 against every coarse one).
Measured: 86% → **92.9%** coverage.

### Text must be found by default

On a game built from real storefronts, signage is most of what is worth
isolating, and a missing letter is the first thing anyone notices.

**Raising the sampling grid does NOT fix it** and will fool you: 28 → 48
moved coverage 85.0% → 86.0% while the letters stayed gone. What finds them is
lowering the **area floor** and the **confidence bar**
(`pred_iou 0.68`, `stability 0.80`, `min_region 60`).

### Check the negative space

Reviewing a segmentation by its proposal sheet only ever shows what was
**found**. Render the complement — every unclaimed pixel — scored by local
contrast so flat sky doesn't count as a miss. That is the only view that shows
you the missing letters.

### Group masks by containment, not centroid

A mask joins a region if **70% of its pixels** are inside it. A centroid rule
put the sky on a column card, because the sky's centroid happened to land in
the column's box.

Add an optional **max area** per region — that is what lets lettering be
lifted off the panel it is printed on, since the panel is 75% inside any box
tight enough to hold the letters.

### Where the edge really comes from

- **Flood-fill the sky once**, from the frame border inward. The sky is by
  definition the background you can reach from outside, so this lands on every
  silhouette at once — every leaf, every plank top, every gap between planks.
- **Seed the fill a few px IN.** Plates vignette to black at the edge, which
  fails any blue-dominance test; seeding from row 0 found *no sky at all*.
- Where two items meet with no sky between them, a **scoped colour reject**
  separates them, or a **keep** rule naming the material an item IS.
- **Fill holes** so dark leaves inside a canopy stay part of the canopy — but
  make it opt-out, because a wheel with real gaps comes back a solid disc.

### Prove the cut is lossless

**The recompose check.** Base plate + every card, stacked at zero offset, must
reproduce the original image. Anything in the difference is either stranded on
the base or drawn twice. Under 0.1% of pixels is good.

Also render the **assignment map** — flat colour per item over the darkened
plate — and *look at it before wiring anything*. Two cards once shipped as
solid rectangles because that step got skipped.

### Inpaint the base

An isolated item must be erased from the base or it appears twice the moment
its rate diverges. Use a **push-pull pyramid** fill, not "stretch the band
above downward" (vertical streaks). The hole is covered by the item at rest,
so a soft fill is invisible.

---

## 3. Ground contact across mismatched sprite projections

**Ground contact must be ONE number** shared by every character. Duplicating
it is how it drifts — one project had the renderer on 3 and the lighting on 2.

It cannot be a flat constant per sprite, because **two projections disagree
about what their lowest pixel means**:

| projection | anchor | result |
|---|---|---|
| isometric 3/4 | midpoint between the feet | gets extra sink for free |
| side profile | genuinely lowest pixel | gets none |

So the renderer measures what each sheet's anchor already gives and **tops up
the difference**. Everyone lands identically.

**`getbbox()` will betray you.** It counts any non-zero alpha, and background
removal leaves near-transparent rows *below* the feet. Those become the
measured baseline and every character hovers. Threshold at alpha ~40.

---

## 4. Animation cycles — the trap that eats weeks

**Every generated clip holds more cycles than it looks like.** Measured by
autocorrelation, not assumed:

| clip | actually contains |
|---|---|
| idle | 3 breaths |
| walk | **5.6 strides** |
| run | 9.6 strides |
| jump | 7 separate hops |

Sampling evenly across a 96-frame clip therefore plays *every one of those
cycles per loop*. That produced an idle breathing 168 times a minute, a jump
flailing between grounded and airborne poses, and a walk running 4.2 strides a
second that read as **running in place**.

**Take ONE cycle and time it to a real cadence.** No amount of slowing
playback fixes it, because the frames themselves span the wrong distance.
Measure the period before wiring anything.

Use a **linear frame-index atlas** (`start + col`), not one-row-per-clip — a
clip whose length changes shouldn't force a re-layout.

Some clips should be **driven, not ticked**: pose a jump from vertical
velocity so it always matches what the physics is doing.

### The double-body trap in generated animation

Ask an image-to-video model for "he collapses to the ground" and it very often
draws **both states at once** — the character standing, and a second copy
already lying dead beside him. Every frame, both bodies.

**Counting connected components does not catch it** — the standing figure's
feet touch the lying one and they merge into a single blob.

**Bounding-box WIDTH catches it.** A side-profile human is tall and narrow:

| | bbox | verdict |
|---|---|---|
| one body | 148 × 227 | correct |
| two bodies | 212 × 218 | nearly square — obvious tell |

Prevention: **name the failure, not the goal.** *"EXACTLY ONE person visible
in every frame. Never two figures. Never a duplicate. Do NOT draw a body
already lying on the ground."* Fixed it first try.

Also watch for **dissolve** — clips can evaporate at the end (10813px at frame
18 down to 137px at frame 23). Check per-frame pixel count.

### Make missing clips degrade, not vanish

A renderer that does `if (!anim) return` on an unknown clip is **silent**, and
looks exactly like a rendering bug. Fall back down a chain
(`knockdown → hit → idle`) and share that chain with the animator so the tick
count matches the clip actually drawn. **A missing clip should look wrong, not
look absent.**

---

## 5. Character feel

### Two-gear locomotion

Reaching top speed in ~2 ticks makes the walk clip unreachable and the
character sprints everywhere. Holding a direction should **walk first** and
wind up into a run only if you keep holding, so a tap is always a walk.

But the wind-up **must be short**. 42 ticks (0.7s) got the player killed: a
footstep lands every ~33 ticks, so full speed arrived after the second
footfall. **21 ticks** (11 hold + 10 ramp) commits before the second step —
61% more ground covered in the first 0.7s.

Scale the animation rate by *actual* speed so feet don't skate between gears.

### Air control needs its own constants

Ground deceleration wants to be snappy (0.62) so stopping on a ledge is
precise. Applying that airborne means releasing the run key for an instant
mid-jump sheds all your speed in six ticks and drops you short. Use separate
multipliers: ~0.55 accel, ~0.06 drag.

### Distinguish hazards by MOTION, not by a hit counter

A pothole pitches you forward and locks steering; an enemy knocks you
backward and doesn't. With no dedicated hit clip, the *motion* carries which
one happened.

Three-touch damage self-sequences with no counter at all: touch one costs cash
and a heart (you only have cash on the first), touch two a heart, touch three
puts you down.

### Enemies need ledge detection, and it's not just a bug fix

A patrol that only reverses at its patrol limit walks straight out over pits,
hanging in mid-air above the exact hole that kills the player. Probe the
**leading edge**, not the centre, so it stops with its feet on the last solid
tile.

The payoff is bigger than correctness: **an enemy that turns at the edge is a
SIGNAL.** It marks the safe strip for the player before they test it with
their own body.

---

## 6. The world map interstitial

If a game moves between real places, **use the real transit map**. It costs
nothing and it does work an invented map cannot:

- It is **verifiable** — players who know the city recognise it.
- Adjacency and order are free and correct.
- It can retroactively **justify** things already in the game.

A transit diagram is **topological**, not to scale — that is why they work.
Order and adjacency must be right; exact positions must not.

Label only the stops that matter. Draw the intermediate ones as small dim
unlabelled dots so the line reads as a route with distance along it rather
than beads on a wire.

**Make the interstitial part of the world.** A map board bolted to a tiled
station wall reads as somewhere the character is standing; the same data as a
floating UI panel reads as a debug screen.

**Sample the palette from your own art.** Measure the dominant colours and
median luminance of the actual backdrops and build the screen from those. On a
night game the median luminance was **17** — anything designed at normal
brightness looks like it belongs to a different product.

Snap everything to a pixel grid and turn off image smoothing. Smooth vector
strokes are most of what makes a screen read as UI instead of world.

---

## 7. Procedural effects instead of sprite sheets

Some effects are cheaper and better as code.

**Cartoon scuffle dust** is a few overlapping circles — generating a sheet for
it would be silly. What matters is getting the *shape language* right: a
newspaper-cartoon puff is a **lobed outline** (five circles in a rosette with a
stroked rim), small, and gone in about a third of a second. A big slow billow
reads as an explosion, which is the wrong note under a boot.

**Scattering pickups, the Sonic way.** Lose *everything*, but draw a bounded
burst — cap the sprites at ~24 and give each an equal share. Frame cost is
fixed no matter how rich the player is.

Watch the arithmetic if a server recomputes score: log **one event per unit
lost**, not per sprite, and make each sprite worth a **whole** number of units
(integer division plus remainder). A flat `round()` drifts — 50 units across
24 sprites hands back 4992 of 5000.

---

## 8. Audio without shipping megabytes

Synthesise at runtime; ship only what synthesis can't do. Four small samples
plus WebAudio covered a whole game.

**What makes an arcade impact:**
- A **swept** bandpass, not a static one. Static gives you a drum; sweeping up
  is air being cut, sweeping down is a whip landing.
- Two events the ear binds into one: the **whisper** of the swing leading the
  **slap** by ~22ms.
- A **tanh soft-clip bus** — drive the layers past unity and fold them back so
  the hit reads as compressed and solid, not three tidy sounds at once.
- **Almost no low end.** A martial-arts punch is a mid-and-treble event.

**Measure, don't audition blind.** Off-the-shelf "punch" samples measured
84–94% low-frequency energy — they are thuds and read as a kick drum. A voice
recording measured 1–6%. Solve the blend to a target (~30%) by bisection.

Inharmonic partials (2.76× is the classic bell ratio) are what make a pickup
sound like a chime instead of a synth lead.

**Browsers suspend AudioContext until a real gesture.** Nothing is heard until
you resume it on a keydown or pointerdown.

---

## 9. Anti-cheat scoring

Never trust a score from the client. Submit an **event log** (`{t, type}`) and
recompute the score server-side from the same rules. Reject out-of-order
events and anything beyond the run's duration.

Split public from private: return name + score publicly, never contact details.

---

## 10. The verification habit

This is the section that actually mattered.

- **Measure it or don't claim it.** Reading coordinates off a scaled
  screenshot produced wrong numbers repeatedly. Locate items by colour
  signature and connected components; detect edges per column.
- **Look at what's MISSING**, not just what worked.
- **Every change needs a check that could FAIL.** A rule was once "fixed" by
  lowering a threshold when it matched zero pixels either way — believed for
  days.
- **"I can't" is a claim too.** Read the config, call the tool, read the error
  before saying something is impossible.
- **Anchor edits on something unique**, then verify the file still imports.
- **Correctness before scale.** A wide rate spread and full-frame blits both
  shipped as regressions before being dialled back.

### The integer-overflow bug worth knowing about

In NumPy 2, an **int16 array times a Python int stays int16**. So
`r*299 + g*587 + b*114` overflows for any red above 109 and wraps negative.

It measured 37.5% of pixels wrong, made one colour rule match **zero pixels
ever**, made another claim 313k pixels of bright art as unlit black — and
shipped as a fence with its planks chewed to lace. The same bug in uint8 form
showed up again while sampling a palette.

**Cast to int32 before you weight.** This is the single highest-value line in
this document.
