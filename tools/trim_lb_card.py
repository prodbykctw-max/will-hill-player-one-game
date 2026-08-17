#!/usr/bin/env python3
"""
Trim the painted surround off his MARTA breeze card, leaving only the card.

Client, marking the screenshot in two colours: *"I've used red dots to touch
the edge of the card that I wanna keep and I've used yellow to show the part
that I want removed, like that perimeter. I want the actual card."*

The plate is 852x1846 and the card is only the middle of it — the rest is a
painted blue sky and city skyline sitting BEHIND the ticket. Not to be confused
with the dimmed game behind the panel, which he explicitly wants kept: this is
scenery inside his own image.

⚠️ THE CARD'S OWN SKYLINE ART STAYS. There are two skylines in that picture —
one printed on the ticket, one behind it. Only the one behind it goes.

MEASURED, NOT EYEBALLED
-----------------------
Per row, the surround colour is sampled at the far edge and the scan walks
inward until a pixel stops matching it. That finds the ticket's edge on every
row without assuming anything about its colour, which matters because the card
is cream at the top and near-black in the middle — a brightness threshold picks
the header and loses the body.

    card box      x 34..818, y 147..1743   ->  784 x 1596
    corner radius 46px, from where the top row first becomes card

The corners are cut to alpha, because outside a rounded corner is still
surround; a straight crop would leave four little blue triangles.

⚠️ EVERY FRACTION ON THAT CARD MOVES, and this prints the new ones. Positions
in index.html and ROW_TOP in src/ui/panel.js are fractions of the CARD ELEMENT,
which used to be the whole plate. Cropping changes the coordinate space:

    vertical    v' = (v * 1846 - 147) / 1596
    horizontal  h' = (h *  852 -  34) /  784     (34px off each side, symmetric)

And the art gets BIGGER for the same element height — the element keeps the
viewport height and its aspect goes 0.4615 -> 0.4912, so the ticket renders
1.157x larger while 1cqw only grows 1.064x. Type sized in cqw therefore needs
multiplying by 1.157/1.064 = 1.087 to stay in proportion to the lettering he
drew. That is the kind of thing that silently makes a board look "a bit off".

Usage:
    python3 tools/trim_lb_card.py            # writes the asset, prints the maths
    python3 tools/trim_lb_card.py --map 0.5385 0.127
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'src', 'assets', 'backgrounds', 'leaderboard-card.webp')
KEEP = os.path.join(ROOT, 'assets', 'ui-concept', 'leaderboard-card-framed.webp')

BOX = (34, 147, 818, 1743)          # the ticket inside the plate
RADIUS = 46                          # its own corner radius, measured
OLD_W, OLD_H = 852, 1846
NEW_W, NEW_H = BOX[2] - BOX[0], BOX[3] - BOX[1]
# ⚠️ THE cqw FACTOR IS OLD_W / NEW_W, and the first version of this line was an
# algebra mistake that cancelled to exactly 1.0 and looked plausible. Derive it:
# the element keeps the viewport height, so for height H the container went
# 0.4615H wide to 0.4912H (x1.064) while the TICKET went 0.4246H to 0.4912H
# (x1.157, which is OLD_H/NEW_H). Type has to follow the ticket, not the
# container, so the correction is 1.157/1.064 — and that reduces to the width
# ratio, because cqw is a fraction of the container and the card's share of it
# went from 784/852 to all of it.
CQW = OLD_W / NEW_W


def vmap(v):
    return (v * OLD_H - BOX[1]) / NEW_H


def hmap(h):
    return (h * OLD_W - BOX[0]) / NEW_W


def main():
    if '--map' in sys.argv:
        for raw in sys.argv[sys.argv.index('--map') + 1:]:
            f = float(raw)
            print(f'{f:.4f}  ->  vertical {vmap(f):.5f}   horizontal {hmap(f):.5f}')
        return

    im = Image.open(SRC).convert('RGB')
    if im.size != (OLD_W, OLD_H):
        raise SystemExit(f'expected {OLD_W}x{OLD_H}, got {im.size} — re-measure BOX')
    if not os.path.exists(KEEP):
        im.save(KEEP, 'WEBP', quality=90, method=6)
        print('kept the framed original at', os.path.basename(KEEP))

    card = im.crop(BOX).convert('RGBA')
    # Round the corners to alpha. Outside a rounded corner is surround, and a
    # square crop leaves four blue triangles at the corners of his ticket.
    mask = Image.new('L', card.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, card.size[0] - 1, card.size[1] - 1], radius=RADIUS, fill=255)
    card.putalpha(mask)
    card.save(SRC, 'WEBP', quality=90, method=6, lossless=False, exact=True)
    print(f'wrote {SRC}  {card.size[0]}x{card.size[1]}  '
          f'{os.path.getsize(SRC) / 1024:.0f}KB')

    a = np.asarray(card)
    print(f'corner alpha check: {a[0,0,3]} {a[0,-1,3]} {a[-1,0,3]} {a[-1,-1,3]} '
          f'(all should be 0)   centre {a[NEW_H//2, NEW_W//2, 3]} (should be 255)')

    print(f'\naspect-ratio: {NEW_W} / {NEW_H}   (was {OLD_W} / {OLD_H})')
    print(f'height cap:   {NEW_H}px           (was {OLD_H}px)')
    print(f'cqw values:   multiply by {CQW:.4f}')
    print('\nvertical fractions:')
    for name, v in [('ROW_TOP[0]', 0.5385), ('ROW_TOP[1]', 0.5850),
                    ('ROW_TOP[2]', 0.6300), ('ROW_TOP[3]', 0.6745),
                    ('ROW_TOP[4]', 0.7180), ('#lbEmpty top', 0.57),
                    ('#lbYou top', 0.795), ('.note top', 0.845),
                    ('#lbActions top', 0.864), ('#lbActions height', None)]:
        if v is None:
            print(f'  {name:18s} 0.0740  ->  {0.074 * OLD_H / NEW_H:.5f}  (a span, not a point)')
        else:
            print(f'  {name:18s} {v:.4f}  ->  {vmap(v):.5f}')
    print('horizontal fractions:')
    for name, h in [('.r left', 0.127), ('.n left', 0.286), ('.n right', 0.13),
                    ('.s right', 0.12), ('actions inset', 0.06),
                    ('#lbEmpty inset', 0.08)]:
        print(f'  {name:18s} {h:.4f}  ->  {hmap(h):.5f}')


if __name__ == '__main__':
    main()
