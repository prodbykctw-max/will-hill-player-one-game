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

import math
import os
import re
import sys

import numpy as np
from PIL import Image, ImageDraw

from cut_planes import PLANES, BG, DEBUG_DIR, ROOT

# DEPTH, not rate. 0 is the far wall, 1 is right at the kerb. The rate is
# derived, so the whole effect dials on one number.
def load_depths(stage):
    """Read the depths out of stages.js rather than keeping a second copy.

    This table used to be duplicated here, and duplicated tables in this repo
    drift — lighting.js held its own copy of the ground-contact constant and
    had already gone 2 against 3 before anyone noticed. The renderer is the
    authority on depth; a verification tool that checks against its own
    private numbers verifies nothing.

    ⚠️ AND IT HAS TO FIND THE DAY HALVES. There is no `id: 'eav-day'` in
    stages.js — a daytime variant is a `day: { bg: { cards: [...] } }` block
    inside its parent stage — so this looked up `id: '<stage>-day'`, threw
    ValueError, and every day cut in this project went unchecked by the one
    tool that exists to check it. Four plates' worth. The suffix is stripped,
    the `day:` block is found inside the parent, and the card list is closed by
    counting brackets instead of matching an indent, because the day block is
    nested two levels deeper than the night one and a hardcoded '\\n      ],'
    only ever finds the night list.
    """
    src = open(os.path.join(ROOT, 'src', 'world', 'stages.js')).read()
    parent = stage[:-4] if stage.endswith('-day') else stage
    i = src.index(f"id: '{parent}'")
    if stage.endswith('-day'):
        i = src.index('day: {', i)
    j = src.index('cards: [', i)
    k = j + len('cards: [')
    depth = 1
    while depth:
        if src[k] == '[':
            depth += 1
        elif src[k] == ']':
            depth -= 1
        k += 1
    # ⚠️ THE BASE IS AT NEUTRAL DEPTH, 0.5 — NOT 0. The renderer draws the
    # plate at BASE_DEPTH so the doubling error splits between near and far
    # cards (backdrop.js). This file had it at 0.0 for a generation, which
    # made every preview show the base walking away from the whole deck at
    # the -0.5 rate — a bug the game did not have.
    out = {'base': 0.5}
    for key, depth in re.findall(r"key: '(\w+)'.*?depth: ([\d.]+)", src[j:k], re.S):
        out[key] = float(depth)
    return out

# Everything scrolls at the plate's existing rate. Depth only adds a small
# DIFFERENCE on top, and that difference is what the eye reads.
BASE_RATE = 0.10
DEPTH_SPREAD = 0.010     # nearest minus farthest, in rate
# ⚠️ 16 WITH A TANH EASE, NOT 90 WITH A WALL. These must mirror backdrop.js
# (MAX_SEPARATION / BASE_DEPTH / cardParallax) or this tool previews a
# parallax law the game no longer ships — which is exactly what it did: it
# sat at a hard 90px clamp for a generation after the renderer moved to a
# 16px tanh ease, so every strip it drew showed separations the player
# would never see. A verification tool that models the dead law grades its
# own memory, not the game. (The one term deliberately NOT mirrored is
# `drift`: it is time-based weather and this preview is a t=0 snapshot, so
# the drift term is identically zero here.)
MAX_SEPARATION = 16      # px — the most any card may sit off the base

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


def rate(name, depths):
    return BASE_RATE + (depths[name] - 0.5) * DEPTH_SPREAD


def offset(name, cam, depths):
    common = cam * BASE_RATE
    diff = cam * (rate(name, depths) - BASE_RATE)
    # The tanh EASE, same as cardParallax: cards slow INTO the bound instead
    # of slamming against it, and near saturation the relative shear between
    # neighbouring depths compresses instead of accumulating.
    return common + MAX_SEPARATION * math.tanh(diff / MAX_SEPARATION)


def load(stage_id):
    base = Image.open(os.path.join(BG, f'{stage_id}-base.webp')).convert('RGBA')
    cards = []
    for it in PLANES[stage_id]:
        p = os.path.join(BG, f"{stage_id}-{it['name']}.webp")
        cards.append((it['name'], Image.open(p).convert('RGBA')))
    return base, cards


def compose(base, cards, cam, depths):
    """Stack at camera position `cam`, each card wrapped at the plate width."""
    W, H = base.size
    out = Image.new('RGBA', (W, H))
    for name, img in [('base', base)] + cards:
        off = int(round(offset(name, cam, depths))) % W
        out.alpha_composite(img, (-off, 0))
        out.alpha_composite(img, (W - off, 0))
        if off:
            out.alpha_composite(img, (-off - W, 0))
    return out


def main():
    sid = sys.argv[1] if len(sys.argv) > 1 else 'eav'
    base, cards = load(sid)
    depths = load_depths(sid)
    W, H = base.size
    orig = Image.open(os.path.join(BG, sid + '.webp')).convert('RGB')

    # ── Recompose check
    rec = compose(base, cards, 0, depths).convert('RGB')
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
        t = compose(base, cards, cam, depths).convert('RGB')
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
