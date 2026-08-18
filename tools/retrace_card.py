#!/usr/bin/env python3
"""
Re-cut one card's mask from the painting, by colour, instead of by rectangle.

WHY. tools/cut_audit.py measures how much of a card's bounding box its mask
actually fills. A traced object fills maybe half of it. `shrub_right` on both
EAV plates fills **100%** — it is a plain rectangle dropped over a shrub and
given depth 0.85, which is the nearest layer on the stage.

That matters because of how the layers compose. The base plate keeps a full
copy of everything a card redraws, and the card is drawn opaque on top of it,
so the card HIDES the base copy everywhere except a sliver along its trailing
edge the width of its own offset — 15px at 0.85. Where the card is traced to
the object, that sliver shows the background behind the object, displaced,
which is exactly what parallax should look like. Where the card is a
rectangle, the sliver shows a displaced copy of whatever the rectangle sliced
through. Here: the middle of a shrub, a fence board and some tarmac.

Client: "you have to distinguish grass from fence — they're two different
colors. I don't understand how you can't cut the grass separate from the
fence." Same answer for a shrub against a fence: foliage is green, boards are
brown, and hue separates them cleanly.

HOW. Grow a region from inside the card's existing footprint through pixels
whose hue matches the target, bounded by a window so the flood cannot escape
into the grass strip below or the tree along the plate. Then close small holes
so foliage gaps do not perforate the mask, and feather the edge slightly the
way cut_planes.py does, so WebP has nothing to invent along it.

⚠️ THIS ONLY REMOVES, NEVER ADDS, unless --grow is passed. Shrinking a card is
safe: the base still paints every pixel the card gives up, at the base's own
rate, so nothing can go missing. Growing a card takes pixels that another card
or the base is currently drawing and starts moving them, which can create a
new tear. Default is the safe direction.

Usage:
    python3 tools/retrace_card.py eav-day shrub_right --preview
    python3 tools/retrace_card.py eav-day shrub_right
"""

import os
import sys

import numpy as np
import scipy.ndimage as ndi
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BG = os.path.join(ROOT, 'src', 'assets', 'backgrounds')

# What each retraceable card is made of, and how far the trace may reach
# outside the card's current box. Explicit, because "what is this object" is
# a judgement against the plate and not something to infer.
TARGETS = {
    'shrub_right': dict(hue=(0.16, 0.45), sat=0.22, val=0.10,
                        pad=(6, 40, 6, 0),      # left, up, right, down
                        why='green foliage against brown fence and grey tarmac'),
}


def hsv(rgb):
    a = rgb.astype(np.float32)
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a.max(2), a.min(2)
    d = np.maximum(mx - mn, 1e-6)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    hue = np.where(mx == R, (G - B) / d,
          np.where(mx == G, 2.0 + (B - R) / d, 4.0 + (R - G) / d))
    return (hue / 6.0) % 1.0, sat, mx / 255.0


def main():
    stage, key = sys.argv[1], sys.argv[2]
    preview = '--preview' in sys.argv
    grow = '--grow' in sys.argv
    if key not in TARGETS:
        raise SystemExit(f'no colour target for {key!r}. Known: '
                         f'{", ".join(sorted(TARGETS))}')
    cfg = TARGETS[key]
    cp = os.path.join(BG, f'{stage}-{key}.webp')
    pp = os.path.join(BG, f'{stage}.webp')
    for p in (cp, pp):
        if not os.path.exists(p):
            raise SystemExit(f'missing {p}')

    card = np.array(Image.open(cp).convert('RGBA'))
    rgb = np.array(Image.open(pp).convert('RGB'))
    old = card[..., 3] > 24
    ys, xs = np.where(old)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    fill = old.sum() / ((y1 - y0) * (x1 - x0))
    print(f'{stage}-{key}: {int(old.sum())} px, box fill {fill * 100:.1f}%')
    print(f'  target: {cfg["why"]}')

    pl, pu, pr, pd = cfg['pad']
    H, W = old.shape
    win = np.zeros_like(old)
    win[max(0, y0 - pu):min(H, y1 + pd), max(0, x0 - pl):min(W, x1 + pr)] = True

    hue, sat, val = hsv(rgb)
    like = (hue > cfg['hue'][0]) & (hue < cfg['hue'][1]) & \
           (sat > cfg['sat']) & (val > cfg['val']) & win

    # Grow only from pixels the card already holds, so the trace stays on THIS
    # object rather than flooding into every green thing on the plate.
    seed = like & old
    lab, n = ndi.label(like, np.ones((3, 3), bool))
    keep = np.unique(lab[seed])
    keep = keep[keep > 0]
    new = np.isin(lab, keep)

    # Foliage is full of sky holes; a perforated mask feathers into lace.
    new = ndi.binary_closing(new, np.ones((5, 5), bool))
    new = ndi.binary_fill_holes(new)
    if not grow:
        new &= old

    print(f'  traced {int(new.sum())} px  '
          f'({int(old.sum()) - int(new.sum())} px given back to the base)')
    ys2, xs2 = np.where(new)
    if len(xs2):
        nb = (xs2.max() - xs2.min() + 1) * (ys2.max() - ys2.min() + 1)
        print(f'  new box fill {new.sum() / nb * 100:.1f}%'
              f'{"  (still a block — check the hue window)" if new.sum() / nb > 0.9 else ""}')
    if preview:
        print('  --preview: nothing written')
        return

    a = Image.fromarray((new * 255).astype(np.uint8)).filter(
        ImageFilter.GaussianBlur(0.6))
    av = np.array(a)
    out = np.dstack([rgb, av])
    out[av == 0] = 0        # nothing for WebP to invent along the edge
    # 94 to match cut_planes.py — these are lossy and a lower quality on
    # re-save degrades the whole card.
    Image.fromarray(out.astype(np.uint8), 'RGBA').save(
        cp, 'WEBP', quality=94, method=6)
    print(f'  -> {os.path.relpath(cp, ROOT)}')


if __name__ == '__main__':
    main()
