#!/usr/bin/env python3
"""
Preview the isolated cards at several camera positions, and prove the cut is
lossless.

Two checks, both worth having before any of this reaches the renderer:

RECOMPOSE — base + every card, stacked in order at zero offset, must reproduce
the original plate. Anything that shows up in the difference is either stranded
on the base (an item nobody claimed) or drawn twice. This is the check that
catches a ghost left behind by a mis-traced edge.

PARALLAX — the same stack at a few camera positions, so the depth reads. The
whole point is rate SEPARATION: the billboard should barely budge while the
fence tears past. If two cards look glued together here they will look glued
together in the game.

Usage:
    python3 tools/preview_planes.py eav
"""

import os
import sys

import numpy as np
from PIL import Image, ImageDraw

from cut_planes import PLANES, BG, DEBUG_DIR

# Rate per card, world-relative: 1.0 tracks the world exactly, 0 is nailed to
# the screen. Ordered by real distance down the street. The spread is wide on
# purpose — the ask was a pronounced pseudo-3D, so the fence at 0.30 crosses
# the frame more than four times for every once the billboard does.
# DEPTH, not rate. 0 is the far wall, 1 is right at the kerb. The rate is
# derived, so the whole effect dials on one number.
DEPTH = {
    'base': 0.00, 'skyline': 0.07, 'mcdonalds': 0.16, 'cars': 0.21,
    'swifty': 0.25, 'citgo': 0.41, 'fence': 0.67, 'verge': 0.75,
    'tree': 0.81, 'shrub_right': 0.85, 'pole': 1.00,
}

# Everything scrolls at the plate's existing rate. Depth only adds a small
# DIFFERENCE on top, and that difference is what the eye reads.
BASE_RATE = 0.10
DEPTH_SPREAD = 0.010     # nearest minus farthest, in rate
MAX_SEPARATION = 90      # px, hard ceiling on the differential

# WHY IT IS THIS SMALL. Two earlier passes got this wrong in opposite ways.
# A wide spread (0.02 -> 0.62) does not read as depth, it reads as the picture
# coming apart — cards slide clean off each other and the empty base shows
# between them. Worse, because each card wraps on its own phase, a fast card
# drifts a whole plate width over a stage: the tree that starts the level on
# the left ends it on the right, which is not parallax, it is the set falling
# over. Holding the spread to 0.010 keeps the tree within ~77px of home across
# the entire 7680px stage — it stays its tree, in front of its bit of fence,
# and only floats. That is the lenticular effect: the shift is small enough
# that nothing distorts, and the depth comes from the relative rates rather
# than from distance travelled. MAX_SEPARATION is the backstop that makes
# migration impossible even if the spread is later dialled up.


def rate(name):
    return BASE_RATE + (DEPTH[name] - 0.5) * DEPTH_SPREAD


def offset(name, cam):
    common = cam * BASE_RATE
    diff = cam * (rate(name) - BASE_RATE)
    return common + max(-MAX_SEPARATION, min(MAX_SEPARATION, diff))


def load(stage_id):
    base = Image.open(os.path.join(BG, f'{stage_id}-base.webp')).convert('RGBA')
    cards = []
    for it in PLANES[stage_id]:
        p = os.path.join(BG, f"{stage_id}-{it['name']}.webp")
        cards.append((it['name'], Image.open(p).convert('RGBA')))
    return base, cards


def compose(base, cards, cam):
    """Stack at camera position `cam`, each card wrapped at the plate width."""
    W, H = base.size
    out = Image.new('RGBA', (W, H))
    for name, img in [('base', base)] + cards:
        off = int(round(offset(name, cam))) % W
        out.alpha_composite(img, (-off, 0))
        out.alpha_composite(img, (W - off, 0))
        if off:
            out.alpha_composite(img, (-off - W, 0))
    return out


def main():
    sid = sys.argv[1] if len(sys.argv) > 1 else 'eav'
    base, cards = load(sid)
    W, H = base.size
    orig = Image.open(os.path.join(BG, sid + '.webp')).convert('RGB')

    # ── Recompose check
    rec = compose(base, cards, 0).convert('RGB')
    a = np.array(rec).astype(int)
    b = np.array(orig).astype(int)
    d = np.abs(a - b).max(axis=2)
    bad = int((d > 26).sum())
    print(f'{sid}: recompose diff — {bad} px over threshold '
          f'({100.0 * bad / d.size:.3f}% of plate), max delta {int(d.max())}')
    hm = np.zeros((H, W, 3), np.uint8)
    hm[..., 0] = np.clip(d * 6, 0, 255)
    hm[d <= 26] = (np.array(orig).astype(int)[d <= 26] * 0.35).astype(np.uint8)
    Image.fromarray(hm).save(os.path.join(DEBUG_DIR, f'{sid}_recompose_diff.png'))

    # ── Parallax strip
    shots = [0, 600, 1800, 4200]
    tiles = []
    for cam in shots:
        t = compose(base, cards, cam).convert('RGB')
        d = ImageDraw.Draw(t)
        d.rectangle([0, 0, 150, 18], fill=(0, 0, 0))
        d.text((5, 5), f'camera x = {cam}', fill=(255, 255, 255))
        tiles.append(t)
    sheet = Image.new('RGB', (W, (H + 6) * len(tiles)), (20, 20, 24))
    for i, t in enumerate(tiles):
        sheet.paste(t, (0, i * (H + 6)))
    sheet.save(os.path.join(DEBUG_DIR, f'{sid}_parallax.png'))
    print(f'wrote {sid}_parallax.png and {sid}_recompose_diff.png')


if __name__ == '__main__':
    main()
