#!/usr/bin/env python3
"""Close the pinholes in the title skyline so clouds cannot show through it.

Client, with a screenshot of the middle tower: "some clouds still kind of go
through the buildings... a cloud that goes partially behind the building and
partially in front of a building looks like it's going through the building,
like inside the building."

⚠️ THE FAR/NEAR FLAG WAS NOT THE PROBLEM, and I chased it first. A cloud is
either drawn before the skyline card or after it — wholly behind or wholly in
front — so that flag cannot make one cloud do both. Partly-behind-and-partly-
in-front means the SILHOUETTE has gaps, and it does: measured on
`title-portrait-skyline.webp`, 126 enclosed holes totalling 5,390 px sit
inside the tower mass, the largest 439 px at x353-372 y507-551. A cloud
drifting behind the towers lights up every one of them on its way past, which
reads exactly as being inside the building.

THE FIX COSTS NOTHING VISUALLY. The skyline card is the same pixels the base
plate already holds, drawn again on top so the far clouds have something to
hide behind. So a hole can be filled with the BASE's own pixel at that
coordinate and the static painting is bit-for-bit what it was — the only
difference is that a cloud can no longer be seen through it. No repainting,
no inpainting, no invention.

Only ENCLOSED holes are filled. A gap that reaches open sky is real sky
between two buildings and must stay transparent, or clouds would vanish while
crossing a genuine gap.

    python3 tools/seal_skyline.py            # report only
    python3 tools/seal_skyline.py --write
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
BG = ROOT / 'src' / 'assets' / 'backgrounds'
CARD = 'title-portrait-skyline.webp'
BASE = 'title-portrait.webp'
SKYFILL = 'title-portrait-skyfill.webp'


def main():
    write = '--write' in sys.argv

    card = Image.open(BG / CARD).convert('RGBA')
    base = Image.open(BG / BASE).convert('RGB')
    if card.size != base.size:
        raise SystemExit(f'{CARD} {card.size} does not match {BASE} {base.size}')

    a = np.array(card)
    b = np.array(base)
    alpha = a[..., 3]

    # ⚠️ ENCLOSED HOLES WERE ONLY HALF OF IT.
    #
    # The first pass filled holes fully surrounded by tower and the client,
    # looking at my own before/after, said clouds were STILL "coming out or
    # reappearing from the center of the building face". He was right: a gap
    # that reaches the sky is not enclosed, so fill_holes never saw it, and a
    # cloud crossing one emerges mid-face exactly as he described. Measured
    # after the first pass: 6,859 px of building still uncovered, the worst a
    # 1,734 px notch at x503-546 y472-579 — dead in the cloud band.
    #
    # So the question is no longer "is this hole enclosed" but "is this
    # BUILDING". Sky is found by flooding blue from the top of the plate
    # (with the drifting clouds patched out by the sky-fill first, or the
    # baked ones would read as structure); anything in the card's own row
    # band that is neither sky nor cloud is building and must be opaque.
    # Genuine sky between two towers is reachable by that flood, so it stays
    # transparent and clouds still cross real gaps.
    fillimg = Image.open(BG / SKYFILL).convert('RGBA')
    comp = b.copy()
    fm = np.array(fillimg)[..., 3] > 8
    comp[fm] = np.array(fillimg)[..., :3][fm]
    r, g, bl = (comp[..., 0].astype(int), comp[..., 1].astype(int),
                comp[..., 2].astype(int))
    mx = comp.max(axis=2).astype(float) / 255
    mn = comp.min(axis=2).astype(float) / 255
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    # ⚠️ AND THE FLOOD MUST NOT RUN DOWN A BUILDING'S SHADOWED FACE.
    #
    # This is the bug two passes of sealing did not fix, and the client named
    # it exactly: "the dark side of the building on the right side, that long
    # shadow strip going down the building, is treating that like it's
    # something separate."
    #
    # A shadowed face is painted DARK BLUE. It passes the blue test, and it
    # meets open sky at the roofline — so the flood pours in at the roof and
    # runs the whole height of the strip, marking it sky. It never got
    # sealed, so a cloud behind the tower stayed visible all the way down it:
    # in front of the lit face, gone behind it, back again down the shadow.
    #
    # Measured on the tower band: of 173,056 px the flood called sky, 30,494
    # (17.6%) were darker than 0.40, while real sky sits at 0.596 (25th pct)
    # to 0.694 (95th). The two populations do not overlap — the 10th
    # percentile is 0.333 and the 25th is 0.596 — so a floor of 0.50 lands in
    # the empty gap between them and cannot cut into real sky.
    SKY_MIN_V = 0.50
    blue = (bl > r + 12) & (bl > g + 4) & (mx > SKY_MIN_V)
    cloudish = (mx > 0.62) & (sat < 0.30)
    core = ndimage.binary_erosion(blue & ~cloudish, iterations=1)
    lab, _ = ndimage.label(core)
    seeds = np.unique(lab[0:4][lab[0:4] > 0])
    sky = ndimage.binary_dilation(np.isin(lab, seeds), iterations=1) & blue

    solid = alpha > 128
    ys_c, _xs_c = np.where(solid)
    band = np.zeros(solid.shape, bool)
    band[ys_c.min():ys_c.max() + 1] = True
    building = band & ~sky & ~cloudish
    holes = building & ~solid
    lbl, n = ndimage.label(holes)
    print(f'{CARD}: {n} gaps, {int(holes.sum())} px of building left uncovered')
    if n:
        sizes = ndimage.sum(holes, lbl, range(1, n + 1))
        for k in np.argsort(sizes)[::-1][:6]:
            m = lbl == (k + 1)
            ys, xs = np.where(m)
            print(f'   {int(sizes[k]):6d}px  x{xs.min()}-{xs.max()} y{ys.min()}-{ys.max()}')

    # The card's own RGB is meaningless where it is transparent, so the fill
    # comes from the base plate — which is where these pixels came from.
    out = a.copy()
    out[holes, 0:3] = b[holes]
    out[holes, 3] = 255

    # Prove it: no enclosed hole survives, and nothing that was already opaque
    # moved a single level.
    na = out[..., 3] > 128
    left = int((building & ~na).sum())
    untouched = np.array_equal(out[solid][:, 0:3], a[solid][:, 0:3])
    print(f'  after: {left} building px still uncovered; '
          f'existing opaque pixels unchanged: {untouched}')

    if write:
        Image.fromarray(out).save(BG / CARD, quality=95, method=6, lossless=True)
        print(f'  wrote {CARD}')
    else:
        print('  report only — pass --write to seal it')


if __name__ == '__main__':
    main()
