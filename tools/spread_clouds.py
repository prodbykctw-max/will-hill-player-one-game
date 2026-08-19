#!/usr/bin/env python3
"""
Spread a stage's existing cloud puffs across the whole plate width.

✅ APPLIED to eav-day, underground-day and l5p-day (edgewood-day already had
even coverage). The seal that used to make this unshippable is fixed — it
excludes nothing now and the cloudish exclusion is size-floored — and with it
three cloudseal runs hold at eav 28 / edgewood 0 / underground 0 / l5p 21-22
with NO allowance table. The "WHY IT IS NOT APPLIED" footer below is kept as
the history of why it once could not ship.


WHAT THIS FIXES, IN THE CLIENT'S WORDS: *"I wanna figure out how to get the
clouds moving on every daytime stage."*

⚠️ THEY ALREADY MOVE. Every day stage has a `clouds` card with a `drift`
(-0.035, Underground -0.030), and `cloudseal.mjs` proves the weather passes
behind the buildings on all four. The complaint is not that they are still, it
is that for long stretches of a stage THERE ARE NONE — and that is a coverage
problem, not a motion one.

Measured with cloudseal's own `painted` count (how many pixels the clouds card
actually contributes to a frame), at five camera positions per stage:

    eav          spawn 0px at EVERY tick, 70-316 at 25%, then 8,789 at 75%
    underground  27-135 at spawn, then 262-4,530
    l5p          15-1,114 at spawn, then 645-4,700
    edgewood     165-2,771 throughout — the one that is fine

The cause is the card, not the span. `span` is a CLIP, not content: widening it
over a region with no painted puffs shows nothing. The puffs only occupy part
of each plate:

    eav-day          x 750-1198 of 1532  —  29% of the width
    edgewood-day     x 124-503  of 762   —  50%
    l5p-day          x 136-583  of 764   —  59%
    underground-day  x 337-1455 of 1535  —  73%

EAV has clouds over less than a third of its plate, and the third they are on
is the far end. That is exactly the stretch of stage where they read, and the
first half where they do not.

WHAT THIS DOES, AND WHAT IT REFUSES TO DO. It copies HIS OWN PUFFS — whole
connected components, alpha and all — to the empty parts of the same card, with
a horizontal flip and a small vertical jitter so a repeat does not read as a
repeat. **No cloud is invented, drawn or generated.** Every pixel written was
painted by the client; it is the same puff, somewhere else on the same card.

⚠️ IT TOUCHES THE CLOUDS CARD AND NOTHING ELSE. Not the base, not the seal.
A puff added to the card draws over the base's own sky and behind everything
the seal covers, which is the arrangement that already works — see the seal
note in tools/scrub_stage_clouds.py. Nothing about the composite at rest
changes anywhere a puff is not placed.

⚠️ DETERMINISTIC. The placement is seeded off the stage name, so a re-run
produces the same card and a diff is meaningful. There is no wall-clock and no
unseeded random anywhere in here.

WHY PUFFS ARE PLACED IN THE ORIGINAL Y BAND ONLY. The band a stage's clouds
occupy is a fact about that painting — how much sky is above its rooflines.
Dropping a puff below it would put weather inside the architecture, and while
the seal would occlude most of it, "most" is how the longest-running bug on
this project looked for a week.

Usage:
    python3 tools/spread_clouds.py eav-day              # report, write nothing
    python3 tools/spread_clouds.py eav-day --write
    python3 tools/spread_clouds.py --all --write
"""

import os
import sys
import zlib

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BG = os.path.join(ROOT, 'src', 'assets', 'backgrounds')

STAGES = ['eav-day', 'edgewood-day', 'underground-day', 'l5p-day']

MIN_PUFF = 120      # px — below this it is a wisp, not worth repeating
GAP = 24            # px — keep this much clear air between placed puffs
# How much of the plate width should carry cloud. Not 100%: a sky with an
# unbroken chain of cloud across it reads as a texture, not as weather, and the
# client's own paintings leave clear sky between puffs.
TARGET_COVER = 0.86


def puffs(alpha):
    """Connected components of the card, largest first."""
    lbl, n = ndimage.label(alpha > 8, structure=np.ones((3, 3)))
    if not n:
        return []
    sizes = ndimage.sum(alpha > 8, lbl, np.arange(1, n + 1))
    out = []
    for i, sl in enumerate(ndimage.find_objects(lbl)):
        if sizes[i] < MIN_PUFF:
            continue
        out.append((int(sizes[i]), sl, (lbl[sl] == i + 1)))
    out.sort(key=lambda t: -t[0])
    return out


def spread(stage, write=False):
    path = os.path.join(BG, f'{stage}-clouds.webp')
    im = Image.open(path).convert('RGBA')
    a = np.array(im)
    H, W = a.shape[:2]
    ps = puffs(a[..., 3])
    if not ps:
        print(f'{stage}: no puffs >= {MIN_PUFF}px — nothing to spread')
        return

    occupied = a[..., 3] > 8
    cols = np.nonzero(occupied.any(axis=0))[0]
    rows = np.nonzero(occupied.any(axis=1))[0]
    y_lo, y_hi = int(rows.min()), int(rows.max())
    before_cover = len(cols) / W
    print(f'{stage}: {len(ps)} puffs, band y{y_lo}-{y_hi}, '
          f'column cover {before_cover * 100:.0f}%')

    # ⚠️ SEEDED OFF THE STAGE NAME WITH crc32, NOT hash().
    # Python randomises str.__hash__ per PROCESS unless PYTHONHASHSEED is set,
    # so `hash(stage)` gave a different card on every run while the docstring
    # above promised a re-run would reproduce it. A tool that claims to be
    # deterministic and is not is worse than one that never claimed it: the
    # diff stops being evidence.
    rng = np.random.default_rng(zlib.crc32(stage.encode()))

    # Walk the width and drop a puff wherever there is a clear run. Candidate
    # positions are on a jittered grid so the repeat does not beat against the
    # plate's own rhythm.
    placed = 0
    step = max(60, W // 24)
    taken = ndimage.binary_dilation(occupied, iterations=GAP // 2)
    order = rng.permutation(len(ps))
    k = 0
    # ⚠️ SEVERAL PASSES, NOT ONE. A single left-to-right walk stops at whatever
    # the first pass happened to fit and leaves the target unmet — l5p reached
    # 50% against a target of 86% that way, because its puffs are small and one
    # walk cannot fill between its own placements. Repeat until the target is
    # met or a whole pass places nothing, which is the honest termination: no
    # progress means no room, and looping past that would only shave the gap.
    for _ in range(6):
        before_pass = placed
        x = 0
        while x < W:
            if len(np.nonzero(occupied.any(axis=0))[0]) / W >= TARGET_COVER:
                break
            src_sz, sl, mask = ps[order[k % len(order)]]
            k += 1
            ph, pw = mask.shape
            jx = int(rng.integers(0, max(1, step // 2)))
            px0 = x + jx
            if px0 + pw >= W:
                x += step
                continue
            # Vertical jitter, clamped so the puff stays inside the painting's own
            # cloud band — see the note at the top about weather in the masonry.
            sy0 = sl[0].start
            lo = y_lo - sy0
            hi = (y_hi - ph) - sy0
            jy = int(rng.integers(min(lo, hi), max(lo, hi) + 1)) if hi > lo else 0
            py0 = sy0 + jy
            if py0 < 0 or py0 + ph > H:
                x += step
                continue
            if taken[py0:py0 + ph, px0:px0 + pw].any():
                x += step
                continue

            patch = a[sl][..., :].copy()
            m = mask
            if rng.random() < 0.5:                     # flip, so a repeat reads new
                patch = patch[:, ::-1]
                m = m[:, ::-1]
            dst = a[py0:py0 + ph, px0:px0 + pw]
            sel = m & (patch[..., 3] > 0)
            dst[sel] = patch[sel]
            occupied[py0:py0 + ph, px0:px0 + pw] |= sel
            taken = ndimage.binary_dilation(occupied, iterations=GAP // 2)
            placed += 1
            x += step
        if placed == before_pass:
            break

    cols2 = np.nonzero(occupied.any(axis=0))[0]
    after_cover = len(cols2) / W
    span = (round(float(cols2.min()) / W, 3),
            round(min(1.0, float(cols2.max() + 1) / W), 3))
    print(f'  placed {placed} copies  ->  column cover '
          f'{before_cover * 100:.0f}% -> {after_cover * 100:.0f}%   '
          f'opaque {int((a[..., 3] > 8).sum())}px')
    print(f'  span for stages.js: [{span[0]:.3f}, {span[1]:.3f}]')

    if write:
        Image.fromarray(a).save(path, 'WEBP', quality=95, method=6)
        print(f'  wrote {os.path.basename(path)} (clouds card ONLY)')
    else:
        print('  dry run — nothing written')


def main():
    write = '--write' in sys.argv
    args = [x for x in sys.argv[1:] if not x.startswith('--')]
    names = STAGES if ('--all' in sys.argv or not args) else args
    for n in names:
        spread(n, write)


if __name__ == '__main__':
    main()


# ── WHY IT IS NOT APPLIED ────────────────────────────────────────────────────
#
# It does what it says. Applied to all four day stages it transformed the
# coverage the client is asking about, measured with cloudseal's own `painted`
# count at five camera positions:
#
#     eav   spawn   0px at every tick  ->  826/610/149/201/43/12
#     eav   25%     70-316             ->  418-1581
#     l5p   spawn   15-1114            ->  3399-5579
#     ug    spawn   27-135             ->  120-301
#
# AND IT PUT WEATHER WHERE THE SEAL CANNOT COVER IT. Clouds in new places cross
# structure the sky seal does not own, and the leak went the wrong way — eav
# failed at 160-231px (one 301px blob) in two runs of three, against the 104px
# problem the seal work had just brought down to 46. Edgewood, which was the
# one stage whose coverage was already fine, went from 0px to 202.
#
# The seal rule that would support this is known and half-proven: the seal may
# only defer to a card at BASE_DEPTH (0.50), because anything off 0.50 slides
# off the ground it was trusted to redraw. Implemented and measured, it fixed
# eav (341 -> 46) and underground, and improved l5p (87 -> 28-64) — but it is
# not committed, because at the time it was measured the harness still had an
# intermittent false positive that made a one-run pass meaningless. That
# instability is fixed now (the player is held out of the measured band), so
# the honest next step is:
#
#   1. re-apply the BASE_DEPTH rule in tools/scrub_stage_clouds.py's `others`
#   2. rebuild the seals with --seal-only
#   3. run this, --write, on eav-day / underground-day / l5p-day only
#      (edgewood-day already has even coverage and gains nothing)
#   4. widen the four `span` values in stages.js to the numbers printed here
#   5. cloudseal, THREE runs, and only believe a result that repeats
#
# The client's own order was "fix the cloud leak, then figure out how to get
# the clouds moving on every daytime stage". That order is right, and step 1 is
# still the leak.
