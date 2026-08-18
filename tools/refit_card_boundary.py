#!/usr/bin/env python3
"""
Move the seam between two stacked cards off a straight line and onto the
actual boundary in the painting.

WHY. Client, looking at Will Hill standing at the EAV fence: "you cut the
fence too early and the fence is not evenly matching up. You have to
distinguish grass from fence — they're two different colors. I don't
understand how you can't cut the grass separate from the fence."

He is right, and the measurement is unambiguous. On eav-day the `fence` card
bottoms out at a dead-flat y=447 across 786 of its 860 columns, and the
`verge` card starts at a dead-flat y=445 across all 860. Neither line has
anything to do with where grass actually meets wood. Detecting the real grass
top by hue puts it anywhere from y446 to y541 — up to 95px below the seam.

So the `verge` card, which is meant to be a foreground strip of grass, owns:
  * the bottom ~30px of every fence board, and
  * the lower half of both light boxes, sliced through the middle.

`verge` runs at depth 0.75 and `fence` at 0.50, so all of that shears away
from the rest of its own object by up to 14px over a stage. A fence whose feet
slide sideways, and two boxes cut in half with the halves drifting apart.

WHAT THIS DOES. Re-partitions the union of the two cards along a boundary
traced from the art instead of a ruler. Per column, scanning up from the
bottom, the top of the contiguous grass run — hue in the green band with real
saturation — is the seam. Above it belongs to the upper card, below it to the
lower one.

⚠️ THE UNION IS PRESERVED EXACTLY. Every pixel either card held before is held
by exactly one of them after: no pixel is dropped (which would leave the
object on the base only, at the wrong parallax) and none is owned twice (which
would double-draw it). The tool refuses to write if that invariant breaks.

⚠️ IT ONLY TOUCHES THE OVERLAP IN X. `verge` is wider than `fence`; outside
the upper card's span the lower card keeps everything it had, because there is
no seam to place out there.

WHY WHOLE OBJECTS END UP ON THE UPPER CARD. The light boxes straddle the grass
line. Split, they shear; whole, they merely parallax with the fence they stand
against. Intact at a slightly wrong rate beats sliced in half at two rates,
and the grass line is what decides it — their tops are above it, so they go up.

Usage:
    python3 tools/refit_card_boundary.py eav-day fence verge
    python3 tools/refit_card_boundary.py eav-day fence verge --preview
"""

import os
import sys

import numpy as np
import scipy.ndimage as ndi
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BG = os.path.join(ROOT, 'src', 'assets', 'backgrounds')

# Green band in hue, plus enough saturation to exclude grey-green shadow on
# wood. Calibrated on eav-day: clearly-grass patches score inside it, clearly
# fence patches do not.
HUE_LO, HUE_HI, SAT_MIN = 0.18, 0.42, 0.28
# How many non-grass rows end the run when scanning up. Small enough to stop at
# the true top, large enough to jump the dark gaps between blades.
RUN_BREAK = 6
# Single-column spikes in the detected line are noise, not blades.
SMOOTH = 9


def hsv_parts(rgb):
    a = rgb.astype(np.float32)
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a.max(2), a.min(2)
    d = np.maximum(mx - mn, 1e-6)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    # ⚠️ SIGNS. max=R -> (G-B)/d, max=G -> 2+(B-R)/d, max=B -> 4+(R-G)/d.
    # Getting these backwards mirrors the wheel, which put grass outside the
    # green band and found a line on 240 columns instead of 860.
    hue = np.where(mx == R, ((G - B) / d),
          np.where(mx == G, 2.0 + (B - R) / d, 4.0 + (R - G) / d))
    return (hue / 6.0) % 1.0, sat


def grass_top(rgb, x0, x1, y_hint):
    """Top of the contiguous grass run per column, scanning up from the base."""
    hue, sat = hsv_parts(rgb)
    grass = (hue > HUE_LO) & (hue < HUE_HI) & (sat > SAT_MIN)
    H, W = grass.shape
    top = np.full(W, -1, np.int32)
    for x in range(x0, x1):
        best, miss = -1, 0
        for y in range(H - 1, max(0, y_hint - 160), -1):
            if grass[y, x]:
                best, miss = y, 0
            else:
                miss += 1
                if miss >= RUN_BREAK and best >= 0:
                    break
        top[x] = best
    got = top >= 0
    if got.sum() > SMOOTH:
        sm = ndi.median_filter(top[got].astype(np.float32), size=SMOOTH)
        top[got] = np.round(sm).astype(np.int32)
    return top


def main():
    stage, upper, lower = sys.argv[1], sys.argv[2], sys.argv[3]
    preview = '--preview' in sys.argv
    pu = os.path.join(BG, f'{stage}-{upper}.webp')
    pl = os.path.join(BG, f'{stage}-{lower}.webp')
    plate = os.path.join(BG, f'{stage}.webp')
    for p in (pu, pl, plate):
        if not os.path.exists(p):
            raise SystemExit(f'missing {p}')

    U = np.array(Image.open(pu).convert('RGBA'))
    L = np.array(Image.open(pl).convert('RGBA'))
    rgb = np.array(Image.open(plate).convert('RGB'))
    ua, la = U[..., 3] > 24, L[..., 3] > 24
    H, W = ua.shape

    cols = np.where(ua.any(0))[0]
    x0, x1 = int(cols.min()), int(cols.max()) + 1
    ys = np.arange(H)[:, None]
    seam_before = np.where(ua.any(0), (ua * ys).max(0), -1)
    hint = int(np.median(seam_before[cols]))
    top = grass_top(rgb, x0, x1, hint)
    found = top[x0:x1] >= 0
    print(f'{stage}: {upper}/{lower} seam over x {x0}..{x1}')
    print(f'  old seam   flat at y~{hint}')
    print(f'  grass line found on {int(found.sum())}/{x1 - x0} cols, '
          f'y {int(top[x0:x1][found].min())}..{int(top[x0:x1][found].max())}')

    union = ua | la
    new_u, new_l = ua.copy(), la.copy()
    # The flat cut left the two cards overlapping by ~2 rows. Columns the seam
    # detector cannot read keep their old split, so resolve that overlap in
    # favour of the upper card first — otherwise the invariant check trips on
    # damage this tool did not cause.
    new_l &= ~new_u
    moved_up = moved_down = 0
    for x in range(x0, x1):
        t = top[x]
        if t < 0:
            continue
        col = union[:, x]
        above = col.copy(); above[t:] = False
        below = col.copy(); below[:t] = False
        # Anything the seam does not reach is still partitioned, so a column
        # cannot keep the 2px of pre-existing double-ownership the flat cut
        # left behind.
        moved_up += int((above & ~ua[:, x]).sum())
        moved_down += int((below & ~la[:, x]).sum())
        new_u[:, x] = above
        new_l[:, x] = below

    # The invariant: same pixels, each owned once.
    if not np.array_equal(new_u | new_l, union):
        raise SystemExit('REFUSING: the union changed — pixels would be lost')
    both = int((new_u & new_l).sum())
    if both:
        raise SystemExit(f'REFUSING: {both} px owned by both cards')
    print(f'  moved {moved_up} px up to {upper}, {moved_down} px down to {lower}'
          f'  (union preserved, no double-ownership)')

    if preview:
        print('  --preview: nothing written')
        return
    for arr, mask, path in ((U, new_u, pu), (L, new_l, pl)):
        out = arr.copy()
        # Pixels this card gains take their colour from the plate; ones it
        # loses go fully transparent, colour zeroed so WebP invents nothing
        # along the new edge (same rule cut_planes.py uses).
        gained = mask & (arr[..., 3] <= 24)
        out[..., :3][gained] = rgb[gained]
        out[..., 3][mask] = 255
        out[~mask] = 0
        # 94 to match cut_planes.py — these are lossy WebP and re-saving below
        # the quality they were cut at degrades the whole card.
        Image.fromarray(out).save(path, 'WEBP', quality=94, method=6)
        print(f'  -> {os.path.relpath(path, ROOT)}')


if __name__ == '__main__':
    main()
