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
    # ── DAYTIME FIVE POINTS ──────────────────────────────────────────────
    # Read off tools/captures/sam/underground-day_proposals.png against a
    # 100px grid laid over the plate. The day composition is NOT the night
    # one — the arch sits higher, the columns are narrower and further apart,
    # and there is real sky behind everything instead of black — so none of
    # the night boxes below transfer and these are measured fresh.
    'underground-day': [
        # Small, specific things first: each is inside something bigger, and
        # most-specific-first is what stops the parent swallowing it. The
        # 6th element is a MAX AREA, which is what lifts lettering off the
        # panel it is painted on — see the note in the matcher below.
        ('letters',   300, 320,  870,  412, 5200),
        ('loans',      20, 610,  180,  725),
        ('checks',      0, 755,  170,  850),
        ('coke',      715, 655,  895,  810),
        ('waffle',    745, 880,  895,  965),
        ('dirsign',   495, 670,  700,  825),
        ('ped',       340, 692,  500,  800),
        ('newsbox',   555, 965,  685, 1093),
        ('columns',   195, 225,  275, 1093),
        ('columns',   845, 225,  925, 1093),
        # THE ARCH AS ONE CARD. It was split into dome + marquee and both
        # boxes were too tight to CONTAIN their own masks — the wheel spans
        # from the crown down past the bulb skirt — so at 70% containment
        # every big arch piece failed both and fell through to `backdrop`,
        # which put the hero of the plate on the far-distance card. The group
        # map is what showed it: the whole arch came out one violet mass.
        ('arch',      230,  80,  905,  555),
        ('spire',     880, 110, 1000,  575),
        ('clouds',    380,   0, 1122,  340),
        ('trees',     950, 700, 1122, 1020),
        ('trees',     745, 690,  910,  870),
        # Sign posts and lamp standards — thin vertical street furniture that
        # belongs in front of the buildings, not on them. Left unassigned on
        # the first pass and clearly visible as magenta shafts on the map.
        ('poles',     395, 780,  470, 1093),
        ('poles',     640, 700,  700, 1093),
        ('poles',     900, 690,  975, 1010),
        ('towers',    540, 420,  905,  770),
        ('towers',    995, 330, 1122,  770),
        ('street',      0, 1005, 1122, 1093),
        ('leftblock',   0,    0,  325, 1005),
        ('midbuild',  300, 750,  990, 1010),
        ('backdrop',  300,    0,  990,  570),
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
    # ── STILL SCENES: the title painting and the ending painting ─────────
    #
    # THESE ARE NOT STAGE BACKDROPS AND THE REGION LIST IS DELIBERATELY
    # SHORTER. A stage plate has to account for every pixel, because each card
    # scrolls at its own rate and anything left behind in the base would slide
    # against the thing it belongs to. A still scene does not scroll at all:
    # the painting is shown WHOLE and the only cards are the handful of pieces
    # that MOVE. Everything else stays in the base, where it is already
    # correct, and `UNASSIGNED` in the report below is the expected outcome
    # for most of the plate rather than a gap to go and fix.
    #
    # Boxes measured off a 100px grid laid over the 1536x1024 plates, not
    # estimated — see tools/README.md.

    # Title screen. Movers: the cloud bank drifts, Will Hill breathes, the two
    # roadside signs rock on their posts, PRESS START pulses.
    'title': [
        # Listed first purely to keep the lettering OUT of `clouds` — the
        # WILL HILL: line sits inside the sky band and would otherwise be
        # picked up and set drifting across the screen. This group is emitted
        # and then dropped; nothing animates the title text.
        ('letters',   300,  15, 1245,  330),
        ('star',      235, 200,  305,  285),   # the two red stars flanking it
        ('star',     1245, 200, 1315,  285),
        ('signL',       5, 370,  355,  710),   # WELCOME TO ATLANTA + posts
        ('signR',    1240, 440, 1532,  710),   # AHEAD ON THE COME UP + posts
        ('hero',      650, 325,  900,  855),   # Will Hill himself
        ('prompt',    495, 845, 1040,  925),   # PRESS START
        # Last, and stopping at the rooftops: below y 235 the box would start
        # claiming towers, and a drifting skyline is a different game.
        ('clouds',      0,   0, 1536,  235),
    ],

    # Ending screen. The client asked for the crowd to sway "like the trees".
    #
    # NO `bulbs` CARD. The pendant lamps were grouped first and the group map
    # showed the box taking the client's own flavour lines with them — EAST
    # ATLANTA IS YOURS / RESPECT EARNED / LEGEND UNLOCKED sit interleaved with
    # the lamps at the same heights, and ending.js only overpaints the title
    # and the stats panel, so that text stays visible. Swaying it would have
    # been a regression on the thing he asked to keep. The lamps go back into
    # the base, where they hang still — which is what lamps do.
    'ending': [
        # First, or the plaque joins the crowd and sways with it.
        ('prompt',   1190, 875, 1490,  990),   # PRESS START TO CONTINUE
        ('hero',      165, 275,  445,  975),   # Will Hill on the mic
        ('crowd',     385, 550, 1525, 1015),
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

    # --map renders WHAT WAS ACTUALLY ASSIGNED, one colour per card, over a
    # dimmed plate. A card list that looks sensible in the console can still
    # be wrong on the plate — a box can catch the right NUMBER of masks and
    # the wrong ones — and this is the check that would fail if it did.
    # Unassigned masks are drawn hot magenta so gaps are impossible to miss.
    if '--map' in sys.argv:
        plate = Image.open(os.path.join(ROOT, 'src', 'assets', 'backgrounds',
                                        f'{stage}.webp')).convert('RGB')
        plate = plate.crop((0, 0, W, H)).point(lambda v: int(v * 0.35))
        overlay = Image.new('RGB', (W, H), (0, 0, 0))
        px = overlay.load()
        palette = [(255, 96, 96), (96, 200, 255), (255, 210, 90), (140, 255, 140),
                   (220, 140, 255), (255, 150, 60), (120, 255, 235), (255, 110, 190),
                   (170, 200, 90), (90, 140, 255), (240, 240, 140), (200, 120, 90),
                   (110, 255, 160), (255, 180, 130), (150, 150, 255), (200, 255, 60),
                   (255, 80, 40), (60, 220, 120), (190, 90, 220), (240, 200, 200)]
        for ci, name in enumerate(order):
            col = palette[ci % len(palette)]
            for i in groups.get(name, []):
                ys, xs = np.nonzero(M[i])
                for y, x in zip(ys, xs):
                    px[x, y] = col
        for i in unassigned:
            ys, xs = np.nonzero(M[i])
            for y, x in zip(ys, xs):
                px[x, y] = (255, 0, 255)
        out = Image.blend(plate, overlay, 0.62)
        d = ImageDraw.Draw(out)
        for ci, name in enumerate(order):
            d.rectangle([6, 6 + ci * 14, 18, 16 + ci * 14],
                        fill=palette[ci % len(palette)])
            d.text((22, 5 + ci * 14), f'{name} ({len(groups.get(name, []))})',
                   fill=(255, 255, 255))
        d.rectangle([6, 6 + len(order) * 14, 18, 16 + len(order) * 14], fill=(255, 0, 255))
        d.text((22, 5 + len(order) * 14), f'UNASSIGNED ({len(unassigned)})', fill=(255, 255, 255))
        mp = os.path.join(SAM, f'{stage}_groupmap.png')
        out.save(mp)
        print(f'  -> {mp}')

    if '--write' in sys.argv:
        os.makedirs(OUT, exist_ok=True)
        path = os.path.join(OUT, f'{stage}.json')
        with open(path, 'w') as f:
            json.dump({k: sorted(groups[k]) for k in order if k in groups},
                      f, indent=1)
        print(f'  -> {path}')


if __name__ == '__main__':
    main()
