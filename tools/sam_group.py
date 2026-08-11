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
