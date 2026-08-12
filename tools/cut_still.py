#!/usr/bin/env python3
"""
Cut the movers out of a still scene — the title painting and the ending
painting — and inpaint the base underneath them.

HOW THIS DIFFERS FROM cut_planes.py, AND WHY IT IS A SEPARATE TOOL.

A stage backdrop has to account for every pixel: each card scrolls at its own
parallax rate, so anything left behind in the base slides against the thing it
belongs to and the illusion collapses. That is why cut_planes.py carries a
hand-ordered plane list, material rejects, and a depth for every item.

A still scene does not scroll. The client's instruction was to use his
painting WHOLE, and that is what happens — the base IS the painting. The only
things that need lifting off it are the handful of pieces that MOVE, and
everything else stays exactly where he painted it. So there is no depth
ordering to get right, no parallax rates, and no obligation to claim the whole
plate. Most masks are deliberately left unassigned.

WHY THE BASE IS STILL INPAINTED UNDER THE MOVERS. A card is drawn OVER the
base, so at rest the composite is the original painting pixel for pixel. The
moment it moves, the base's own copy of it peeks out from behind — a second
crowd, a ghost cloud. Erasing the mover from the base and filling the hole is
what stops that, and the fill is never seen at rest because the card is
sitting on top of it. Push-pull pyramid fill, shared with cut_planes.py.

WHY THE ALPHA IS FEATHERED. SAM edges are hard and per pixel, which is right
for a cutout and wrong for a thing that is about to be resampled at an
arbitrary screen scale: a 1px hard edge aliases into a crawling line as the
shear moves it. A sub-pixel feather costs nothing and the edge stays put.

Usage:
    python3 tools/cut_still.py title
    python3 tools/cut_still.py ending
    python3 tools/cut_still.py title --debug      # write proofs, no assets
"""
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

from cut_planes import pyramid_inpaint

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BG = os.path.join(ROOT, 'src', 'assets', 'backgrounds')
SAM = os.path.join(ROOT, 'tools', 'sam_masks')

# Which emitted groups are actually animated. A group that is not listed here
# was cut for one of two reasons and is then thrown away: to keep it OUT of a
# bigger group it would otherwise have polluted (`letters`, which sits inside
# the sky band and would have gone drifting off with the clouds), or because
# it turned out to be better handled without a card at all (`prompt`, whose
# cut came back partial — half the letters of PRESS START — and which is
# animated as a pulse over the painting's own text instead).
MOVERS = {
    'title': ['clouds', 'signL', 'signR', 'hero'],
    'ending': ['crowd', 'hero'],
}

FEATHER = 1.1   # px of gaussian softening on the alpha edge


def load_mask(scene, name, w, h):
    p = os.path.join(SAM, scene, f'{name}.png')
    m = np.array(Image.open(p).convert('1'), bool)
    if m.shape != (h, w):
        raise SystemExit(f'{p}: {m.shape[1]}x{m.shape[0]} vs plate {w}x{h}')
    return m


def main():
    scene = sys.argv[1]
    debug = '--debug' in sys.argv
    names = MOVERS[scene]

    plate = Image.open(os.path.join(BG, f'{scene}.webp')).convert('RGB')
    rgb = np.asarray(plate)
    h, w = rgb.shape[:2]
    print(f'{scene}: {w}x{h}, {len(names)} movers')

    claimed = np.zeros((h, w), bool)
    cards = {}
    for name in names:
        m = load_mask(scene, name, w, h)
        # Close pinholes so a face does not come out with gaps where SAM put a
        # boundary between a cheek and a pair of glasses.
        m = ndi.binary_fill_holes(ndi.binary_closing(m, np.ones((3, 3), bool)))
        cards[name] = m
        claimed |= m
        ys, xs = np.where(m)
        print(f'  {name:8s} {int(m.sum()):7d}px  '
              f'x {xs.min()}..{xs.max()}  y {ys.min()}..{ys.max()}')

    # One fill for all of them at once. Filling them one at a time would let
    # an earlier card's blurred hole become source material for a later one.
    base = pyramid_inpaint(rgb, claimed)

    if debug:
        Image.fromarray(base).save(f'/tmp/{scene}_base_proof.png')
        Image.fromarray((claimed * 255).astype(np.uint8)).save(f'/tmp/{scene}_claim_proof.png')
        print(f'  -> /tmp/{scene}_base_proof.png  /tmp/{scene}_claim_proof.png')
        return

    Image.fromarray(base).save(os.path.join(BG, f'{scene}-base.webp'),
                               quality=92, method=6)
    print(f'  base -> {scene}-base.webp')

    for name, m in cards.items():
        a = ndi.gaussian_filter(m.astype(np.float32), FEATHER)
        # Re-bias so the feather eats into the OUTSIDE of the silhouette
        # rather than thinning the item: a crowd whose every head lost a pixel
        # of alpha reads as a crowd behind frosted glass.
        a = np.clip((a - 0.32) / 0.5, 0, 1)
        a = np.maximum(a, m.astype(np.float32))
        out = np.dstack([rgb, (a * 255).astype(np.uint8)])
        Image.fromarray(out, 'RGBA').save(
            os.path.join(BG, f'{scene}-{name}.webp'), quality=92, method=6)
        kb = os.path.getsize(os.path.join(BG, f'{scene}-{name}.webp')) / 1024
        print(f'  {name:8s} -> {scene}-{name}.webp  {kb:.0f} kB')


if __name__ == '__main__':
    main()
