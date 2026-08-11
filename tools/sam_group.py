#!/usr/bin/env python3
"""
Assign SAM masks to parallax cards by region, and report what it did.

WHY REGIONS AND NOT ONE CARD PER MASK. A dense SAM pass on Underground returns
199 usable masks — every lit window, every letter of UNDERGROUND, every kerb
tile. That is the right level of detail to HAVE, and the wrong number of things
to DRAW: EAV's ten cards already cost ~26ms a frame, and 199 would be a
slideshow. So masks group into a dozen depth cards here, and the full mask set
stays on disk for the lighting pass, where per-window and per-bulb glow is
exactly what it is for.

A mask joins the first region that CONTAINS most of it — 70% of its pixels by
default. Centroid-in-box was tried first and is not enough: the sky mask spans
the whole upper right, its centroid lands inside the right-hand column's box,
and the column card came back with 261875px and a bbox covering the plate.
Containment gets it right because only a third of the sky is inside that box.
Regions are ordered most-specific first, so a window inside the office block
goes with the block rather than starting an argument about overlap.

Usage:
    python3 tools/sam_group.py underground          # assign + report
    python3 tools/sam_group.py underground --write  # write the groups file
"""

import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAM = os.path.join(ROOT, 'tools', 'captures', 'sam')
OUT = os.path.join(ROOT, 'tools', 'sam_groups')

# (card, x0, y0, x1, y1) — most specific first. Measured off the plate; see
# tools/captures/sam/<stage>_proposals.png for the numbered mask sheet these
# were read against.
REGIONS = {
    'underground': [
        ('spire',    900, 120, 1000, 400),
        ('coke',     735, 690,  875, 835),
        ('waffle',   780, 840,  895, 950),
        ('dirsign',  500, 700,  680, 840),
        ('ped',      360, 715,  495, 810),
        ('loans',      0, 640,  160, 780),
        ('columns',  190, 290,  310, 1093),
        ('columns',  845, 280,  975, 1093),
        # Cloud bank over the towers. Caught by the arch's box when that was a
        # single rectangle, which put a piece of sky on the hero card.
        ('clouds',   640,  60, 1000,  240),
        # The arch as its three real parts rather than one box: dome+marquee,
        # and a wing rail either side. One box spanning all of them also
        # swallowed the cloud above and two slivers of the office block.
        ('arch',     285, 145,  890,  585),
        ('arch',     148, 400,  315,  560),
        ('arch',     845, 365, 1015,  545),
        ('towers',   975, 250, 1122, 1000),
        ('street',     0, 995, 1122, 1093),
        ('leftblock',  0,   0,  310,  995),
        ('midbuild', 280, 560,  980, 1000),
        ('backdrop', 280,   0,  980,  585),   # buildings behind the arch
    ],
    'l5p': [
        # ── Detail cards, lifted off the surfaces they are painted on ────
        # None of these will read as depth: an OPEN sign in a window has no
        # gap between it and the window. They are cards so each can be lit
        # independently, and they sit one or two hundredths of depth from
        # their parent so they cannot visibly slide against it.
        ('openneon',   348,  215,  420,  262),  # OPEN neon in the left bay
        ('poster',     606,  212,  696,  310),  # portrait in the right window
        ('newusedsign',108,  160,  232,  198),  # NEW & USED
        ('buysell',    246,  155,  310,  218),  # BUY SELL TRADE
        ('awning',     560,  160,  752,  200),  # hanging lamps over the bays
        ('letters',    380,   25,  706,  145, 3000),  # CRIMINAL RECORDS type
        # ── Structure ────────────────────────────────────────────────────
        ('pole',        40,   0,  100,  340),   # street lamp mast, 26x330
        ('farbuild',     0,   55,  105,  300),  # distant lit blocks, far left
        ('sign',       338,    5,  722,  178),  # CRIMINAL RECORDS panel
        ('newused',    100,   92,  237,  336),  # tan brick storefront
        ('brick',      224,   58,  346,  348),  # red brick, BUY SELL TRADE
        ('bayleft',    338,  178,  458,  348),  # bay with the OPEN neon
        ('baymid',     452,  178,  562,  352),
        ('bayright',   552,  158,  748,  352),  # incl. the portrait poster
        ('rightpillar',708,    0,  770,  365),
        ('kerb',         0,  282,  770,  363),  # pavement and kerb
    ],
    # ── Edgewood ─────────────────────────────────────────────────────────
    # This plate was written off earlier in the project as "a flat head-on
    # facade with a pure black sky, nothing standing in front of anything".
    # That was wrong and it came from a bad sample rect: the rect landed in
    # the black GAPS BETWEEN the distant buildings, so the sky read as
    # median (0,0,0). Edgewood has a full lit skyline row across y 0-62,
    # measured — the lit-pixel count climbs from 6px at y=0 to 167px by y=30.
    # It also has the richest signage of the four stages.
    'edgewood': [
        # Detail first: neons and practicals, lifted off the brick.
        ('neon_ourbar',   70,  165,  145,  262),  # OUR BAR / ATL
        ('neon_dis',     640,  165,  715,  262),  # DIS ATL HOE
        ('neon_open',    455,  140,  505,  172),  # OPEN
        ('sign_blm',     298,  226,  372,  288),  # BLACK LIVES MATTER
        ('sign_soul',    415,  222,  492,  256),  # SOUL FOOD & SPIRITS
        ('lamps',          0,   82,  764,  148),  # hanging cone lamps + bulbs
        # Structure, far -> near.
        ('skyline',        0,    0,  764,   64),  # distant lit blocks
        ('parapet',        0,   62,  764,  100),  # top of the bar facade
        ('bay_left',      30,  120,  195,  305),
        ('bay_mid1',     270,  118,  400,  312),
        ('bay_mid2',     400,  118,  570,  312),
        ('bay_right',    580,  120,  745,  305),
        ('facade',         0,   95,  764,  312),  # the brick between the bays
        ('pavement',       0,  296,  764,  372),
    ],
}


CONTAIN = 0.70


def contained(seg, r):
    """Fraction of a mask's pixels falling inside region box `r`."""
    total = int(seg.sum())
    if not total:
        return 0.0
    return int(seg[r[2]:r[4], r[1]:r[3]].sum()) / total


def main():
    stage = sys.argv[1]
    rec = json.load(open(os.path.join(SAM, f'{stage}_masks.json')))
    M = np.load(os.path.join(SAM, f'{stage}_masks.npy'))
    regions = REGIONS[stage]
    H, W = M.shape[1:]

    groups, unassigned = {}, []
    for r in rec:
        seg = M[r['i']]
        # The sky is the one mask that is never a card: it is the background
        # every silhouette is cut against, and it is already the base plate.
        # Identify it by SHAPE, not just size and position — L5P's CRIMINAL
        # RECORDS sign is 16% of the plate and sits entirely in the top half,
        # so an area test alone throws the stage's biggest landmark away. The
        # sky is the thing that touches the top edge and runs nearly the full
        # width; the sign spans 48% of it and starts 11px down.
        x0, y0, x1, _y1 = r['bbox']
        if y0 <= 2 and (x1 - x0) > 0.90 * W and r['area'] > 0.08 * W * H:
            continue
        best, score = None, CONTAIN
        for reg in regions:
            # Optional 6th element: a maximum area. This is what lets a
            # detail card be lifted OFF the panel it is painted on. The
            # CRIMINAL RECORDS lettering sits inside the sign's own box, so a
            # box alone cannot separate them — the panel mask is 75% inside
            # any box tight enough to hold the letters. Capping the region at
            # 3000px takes the letters and leaves the 44316px panel to the
            # `sign` card below it.
            if len(reg) > 5 and r['area'] > reg[5]:
                continue
            c = contained(seg, reg)
            if c >= score:
                best, score = reg[0], c
                break
        if best:
            groups.setdefault(best, []).append(r['i'])
        else:
            unassigned.append(r['i'])

    order = []
    for reg in regions:
        if reg[0] not in order:
            order.append(reg[0])
    print(f'{stage}: {len(rec)} masks -> {len(groups)} cards, '
          f'{len(unassigned)} unassigned')
    for name in order:
        idxs = groups.get(name, [])
        print(f'  {name:11s} {len(idxs):4d} masks')
    if unassigned:
        print(f'  UNASSIGNED  {len(unassigned)}: {unassigned[:20]}')

    if '--write' in sys.argv:
        os.makedirs(OUT, exist_ok=True)
        path = os.path.join(OUT, f'{stage}.json')
        with open(path, 'w') as f:
            json.dump({k: sorted(groups[k]) for k in order if k in groups},
                      f, indent=1)
        print(f'  -> {path}')


if __name__ == '__main__':
    main()
