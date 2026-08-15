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


def main():
    write = '--write' in sys.argv

    card = Image.open(BG / CARD).convert('RGBA')
    base = Image.open(BG / BASE).convert('RGB')
    if card.size != base.size:
        raise SystemExit(f'{CARD} {card.size} does not match {BASE} {base.size}')

    a = np.array(card)
    b = np.array(base)
    alpha = a[..., 3]

    solid = alpha > 128
    filled = ndimage.binary_fill_holes(solid)
    holes = filled & ~solid
    lbl, n = ndimage.label(holes)
    print(f'{CARD}: {n} enclosed holes, {int(holes.sum())} px')
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
    left = int((ndimage.binary_fill_holes(na) & ~na).sum())
    untouched = np.array_equal(out[solid][:, 0:3], a[solid][:, 0:3])
    print(f'  after: {left} enclosed holes left; '
          f'existing opaque pixels unchanged: {untouched}')

    if write:
        Image.fromarray(out).save(BG / CARD, quality=95, method=6, lossless=True)
        print(f'  wrote {CARD}')
    else:
        print('  report only — pass --write to seal it')


if __name__ == '__main__':
    main()
