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
    # ══ FIVE POINTS, ON THE CLIENT'S WIDE PLATE ══════════════════════════
    #
    # ⚠️ THESE ARE MEASURED AGAINST 1535x727, AND EVERY OLDER UNDERGROUND BOX
    # IN THIS FILE IS DEAD. The plate was replaced with his wide 1535x1024 pair
    # (crop 0.71 -> 727 rows); the boxes further down this file belong to the
    # 1122x1402 portrait painting and its 0.78 crop, which is a different
    # picture at a different scale. They are kept only as a record of what the
    # night set used to be — nothing reads them.
    #
    # Read off a 100px grid laid over tools/captures/sam/*_proposals.png, then
    # checked against the group map before anything was cut. Day and night are
    # the same composition relit — his pair cross-correlates at dx 0, dy 2 —
    # so the two tables are close but NOT shared: the night columns sit about
    # 10px left of the day ones and the arch spans 610-900 against 585-965, and
    # a box that is 10px out at 70% containment silently drops a card.
    #
    # SMALLEST FIRST, which is what most-specific-first actually means. The 6th
    # element is a MAX AREA, which is what lifts lettering off the panel it is
    # painted on.
    #
    # NO `street` CARD ON EITHER, deliberately, and this is the one place the
    # old table was actively wrong rather than merely stale. A ground strip has
    # no landmark inside it but it has a hard edge along the top and things
    # stand on that edge; giving the plaza its own card is how the pavement
    # walks out from under the columns planted in it. The plaza is the base.
    'underground-day': [
        # ── Signs, lifted off what they are painted on ───────────────────
        # ⚠️ NO `letters` CARD, AND THE REASON IS WORTH KEEPING. UNDERGROUND on
        # the marquee was cut as its own card so the day glow could be bolted to
        # the word rather than the whole sign — and the cut came back with six
        # of the eleven glyphs: "U D R R U", scattered. SAM's fine pass finds
        # some letters on this plate and not others, and the ones it misses are
        # not recoverable by lowering a threshold that is already at the floor.
        # A partial word is worse than no card: the letters are painted FLAT on
        # the drum with no gap behind them, so they were never a depth layer,
        # and the glow rides `arch` instead — the whole sign, which is the thing
        # actually emitting. Same call on the night half's `marquee`.
        ('coke',      838, 322,  932, 418),
        ('dirsign',   720, 345,  824, 428),
        ('waffle',    860, 442,  930, 498),
        # ⚠️ LOANS AND CHECKS CASHED ARE `midbuild`, NOT THEIR OWN CARDS.
        # They are painted flat on that facade with no gap behind them, so a
        # separate depth buys no parallax, and neither carries a practical in
        # `lights` — the only other reason a detail earns a card. Two fewer
        # full-frame blits a frame.
        ('midbuild',  476, 315,  564, 390),
        ('midbuild',  472, 396,  560, 448),
        ('park',      108,  38,  182, 318),
        # ── Street furniture, in front of the buildings and not on them ──
        # ⚠️ ONE `furniture` CARD, NOT THREE. News boxes, the mail box, the
        # hydrant and the parked cars all sit on the plaza at the same distance,
        # and three cards at one depth is three blits doing one card's job.
        ('furniture', 758, 492,  848, 588),
        ('furniture',1152, 497, 1242, 582),
        # ⚠️ TO x0, NOT TO x36. A 3882px mask at x 0..77 y 437..511 — the
        # shopfront behind the shelter — fell out of a box that started at 36.
        ('shelter',     0, 388,  270, 596),
        ('lamps',    1172, 122, 1348, 608),
        ('lamps',     338, 408,  372, 462),
        ('lamps',     648, 332,  688, 398),
        ('furniture', 196, 482,  352, 548),
        ('furniture', 616, 492,  714, 542),
        # ── Structure, near to far ───────────────────────────────────────
        ('columns',   552, 100,  636, 700),
        ('columns',   894, 100,  962, 704),
        ('arch',      582,  36,  968, 312),
        ('trees',       0, 282,  118, 458),
        ('trees',     982, 292, 1092, 492),
        # ⚠️ THE BUILDING IS LISTED BEFORE THE TREES, and getting that backwards
        # is what put a chunk of the Peachtree block on the tree card. The
        # right-hand street trees come back from SAM as ONE 17960px mask running
        # x 1144..1449, so the box that catches them has to be wide enough to
        # reach x1449 — which also puts the PEACHTREE FURNITURE frontage inside
        # it. With trees first, 9514px of that building (3424 at night) went to
        # a card at a different depth.
        #
        # Building first fixes that. What it does NOT fix is the sign FACE
        # itself: SAM returns the tree line and that sign as a single blob, so
        # 78% of the face still rides `trees` whichever order these are in.
        # Splitting it would need a finer segmentation pass. It is harmless as
        # things stand because `peachtree` and `trees` now sit 0.02 apart in
        # depth (0.50 and 0.48), which is about 2px of travel across a whole
        # stage — see the lettering note in src/world/stages.js.
        ('peachtree',1254, 206, 1535, 584),
        ('trees',    1136, 220, 1460, 476),
        ('midbuild',  366, 286,  774, 552),
        ('midbuild',  760, 380, 1000, 552),
        # The far skyline: the spire behind the right column, the tower group
        # right of it, the low blocks framed inside the arch, and the pale
        # slabs at the right edge.
        ('towers',    902,  92,  988, 344),
        # ⚠️ TO x1420, NOT x1274. Four masks totalling 18k px sat in the gap
        # between 1274 and the right-edge box — the tower group above the
        # Peachtree roofline — and came out magenta on the map.
        ('towers',    986,  10, 1420, 344),
        ('towers',     756, 286,  902, 414),
        ('towers',   1416,   0, 1535, 334),
        ('leftblock',   0,   0,  384, 442),
        # ⚠️ THE HERO'S BACKDROP, AND THE BIGGEST THING THE FIRST PASS MISSED.
        # One 152581px mask running x 372..906 y 0..530 is the tall beige
        # office block the arch stands in front of — the second largest mask on
        # the plate after the plaza — and with no box wide enough to contain it
        # the whole centre of the picture came out unassigned. Listed after the
        # arch and the columns so it cannot swallow them.
        ('backdrop',  360,   0,  914, 540),
    ],
    'underground': [
        # Same scene at night. The Coca-Cola disc and the Waffle House
        # frontage are cards because the night `lights` entries are bolted to
        # them by name — a practical with no card rides the base plate and
        # slides off the thing that emits it. The marquee's bulbs are bolted to
        # `arch` for the reason given on the day half above: cut as its own
        # card the sign came back reading "N ERGROU D".
        ('coke',      840, 330,  918, 410),
        ('dirsign',   716, 340,  812, 406),
        ('waffle',    856, 432,  922, 486),
        ('midbuild',  478, 310,  552, 362),
        ('midbuild',  470, 392,  546, 434),
        ('park',      114,  40,  184, 312),
        ('furniture', 740, 500,  838, 588),
        ('furniture',1150, 508, 1252, 590),
        # Same widenings the day table needed, found the same way — by listing
        # the unassigned masks and their boxes rather than by looking at the
        # picture again. To x0 for the shopfront behind the shelter, to x1420
        # for the tower group above the Peachtree roofline, the right-hand
        # street trees as ONE box because that is how SAM returns them, and
        # both midbuild boxes out to the Waffle House frontage.
        ('shelter',     0, 396,  266, 590),
        ('lamps',    1190, 128, 1350, 600),
        ('lamps',     344, 410,  372, 452),
        ('lamps',     632, 348,  700, 400),
        ('furniture', 272, 486,  360, 538),
        ('furniture', 612, 494,  712, 540),
        ('columns',   532, 104,  614, 704),
        ('columns',   898, 104,  954, 708),
        ('arch',      600,  30,  916, 300),
        ('trees',       0, 288,  110, 452),
        ('trees',     976, 300, 1092, 496),
        # Building before trees, same reason as the day half above.
        ('peachtree',1272, 210, 1535, 578),
        ('trees',    1130, 200, 1462, 512),
        ('midbuild',  296, 288,  770, 548),
        ('midbuild',  748, 374, 1000, 548),
        ('towers',    896,  86,  986, 340),
        ('towers',    984,   4, 1420, 340),
        ('towers',     754, 284,  896, 410),
        ('towers',   1416,   0, 1535, 330),
        ('leftblock',   0,   0,  380, 438),
        # The block the arch stands in front of. At night SAM does not return
        # it as one piece the way it does in daylight — it is dark and its
        # windows are the only thing with edges — so this catches the pieces
        # instead of one hero mask. Listed after the arch and the columns.
        ('backdrop',  356,   0,  912, 536),
    ],
    # ── DEAD: the 1122x1402 portrait painting, two plates ago ────────────
    # Kept as a record of the set that shipped against it. The key is
    # deliberately not a stage name, so nothing can read it by accident.
    '_old-underground-portrait': [
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
    # ── DEAD: the portrait painting's DAY twin, same vintage ─────────────
    '_old-underground-day-portrait': [
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

    # ── DAYTIME EAST ATLANTA VILLAGE ─────────────────────────────────────
    #
    # EAV NIGHT NEVER WENT THROUGH THIS FILE — it is hand-cut in cut_planes.py
    # with colour rules that are explicitly night-only ("strictly blue-dominant
    # AND dark", "shadow is warm or neutral here"), none of which survive a
    # blue sky. So there is no night region list to transform.
    #
    # There is something better, though: the night CARDS. Each one is already a
    # cut RGBA that has survived a recompose check, so its alpha bounding box
    # is a region box validated by use. Those boxes carried across by the
    # measured transform day = 0.9850*night + (-10.3, -11.8) are what these
    # are — not coordinates read off a proposal sheet by eye.
    #
    # Ordered SMALLEST FIRST, which is what most-specific-first actually means.
    # Getting that backwards on edgewood-day cost the whole skyline card: the
    # clouds box contains the skyline's, so putting clouds first swallowed all
    # thirty of its masks.
    'eav-day': [
        ('cars',         1182,  304,  1500,  356),
        ('shrub_right',  1110,  377,  1224,  447),
        ('mcdonalds',    1376,  113,  1500,  259),
        ('skyline',      1175,  139,  1502,  320),
        ('pole',         1240,    0,  1370,  490),
        ('swifty',        196,    4,   637,  130),
        ('citgo',         121,   76,   830,  356),
        # Clouds after the buildings they sit behind, for the reason above.
        ('clouds',        636,    0,  1502,  118),
        ('verge',           0,  444,  1285,  507),
        ('tree',            0,    0,   457,  447),
        ('fence',         324,   75,  1183,  447),
    ],

    'edgewood-day': [
        # ── THE TREE, FIRST BECAUSE IT IS THE SMALLEST BOX ────────────────
        # Day-only, like `clouds`: the night plate's corresponding corner is
        # black. Measured by keying green-dominant pixels off the day plate —
        # foliage is the only green thing in a picture whose sky is blue and
        # whose walls are grey brick — which found a 9093px canopy at
        # x 2..202, y 2..91 and a strip of leaves down the left edge.
        #
        # IT WAS BEING TORN IN HALF. 25% of the canopy fell inside the
        # `skyline` box and travelled with the buildings; the other 75% was
        # unassigned and stayed in the static base. The client saw it: "on
        # stage two you should isolate the trees and the building separately
        # and the skyline… a tree is not where that building is, but it covers
        # it up."
        #
        # Two boxes, one card — same trick underground uses for its columns.
        ('trees',          0,    0,  208,   96),
        ('trees',          0,   92,   26,  200),
        ('neon_ourbar',   71,  199,  145,  295),
        ('neon_dis',     635,  199,  709,  295),
        ('neon_open',    452,  174,  501,  205),
        ('sign_blm',     297,  259,  370,  320),
        ('sign_soul',    412,  255,  489,  289),
        ('lamps',          2,  116,  758,  182),
        ('skyline',        2,   35,  758,   99),
        # ⚠️ CLOUDS AFTER SKYLINE, and the ordering is the whole point.
        # Sky and clouds exist only in the day plates — the night versions are
        # a black band — so this has no night box to transform and is read off
        # the day art. Putting it FIRST looked right ("most specific first")
        # and was exactly backwards: its box CONTAINS the skyline's, so it is
        # the LESS specific of the two, and it swallowed all thirty skyline
        # masks. edgewood-day cut with no skyline card at all until the
        # missing-file crash caught it. Specific means SMALLER, not newer.
        ('clouds',         0,    0,  762,  100),
        ('parapet',        2,   97,  758,  134),
        ('bay_left',      31,  154,  195,  337),
        ('bay_mid1',     269,  152,  398,  344),
        ('bay_mid2',     398,  152,  566,  344),
        ('bay_right',    576,  154,  739,  337),
        ('facade',         2,  129,  758,  344),
        ('pavement',       2,  328,  758,  403),
    ],

    'l5p-day': [
        ('clouds',         0,    0,  764,  120),
        ('openneon',     355,  220,  425,  266),
        ('poster',       608,  217,  696,  313),
        ('newusedsign',  120,  166,  241,  203),
        ('buysell',      255,  161,  318,  223),
        ('awning',       563,  166,  751,  205),
        ('letters',      386,   34,  706,  151, 3000),
        ('pole',          53,    9,  112,  342),
        ('farbuild',      14,   63,  117,  303),
        ('sign',         345,   14,  721,  184),
        ('newused',      112,   99,  246,  339),
        ('brick',        233,   66,  353,  350),
        ('bayleft',      345,  184,  463,  350),
        ('baymid',       457,  184,  565,  354),
        ('bayright',     555,  164,  747,  354),
        ('rightpillar',  708,    9,  768,  367),
        ('kerb',          14,  286,  768,  365),
    ],

    # ── Edgewood ─────────────────────────────────────────────────────────
    # This plate was written off earlier in the project as "a flat head-on
    # facade with a pure black sky, nothing standing in front of anything".
    # That was wrong and it came from a bad sample rect: the rect landed in
    # the black GAPS BETWEEN the distant buildings, so the sky read as
    # median (0,0,0). Edgewood has a full lit skyline row across y 0-62,
    # measured — the lit-pixel count climbs from 6px at y=0 to 167px by y=30.
    # It also has the richest signage of the four stages.
    # ── DAYTIME EDGEWOOD / LITTLE 5 POINTS ───────────────────────────────
    #
    # NOT hand-authored off the proposal sheets, and deliberately. The night
    # and day paintings of each corner are the SAME COMPOSITION at 0.98-0.99
    # scale — tools/check_day_framing.py measures that by matching a named
    # landmark, and it is the same finding that fixed the day plates' framing.
    # So the night plate's boxes, which were read off the art by hand and have
    # already been through a cut, transform straight across:
    #
    #     edgewood   day = 0.9900 * night + (1.5, 35.2)
    #     l5p        day = 0.9800 * night + (13.9, 9.3)
    #
    # That is better than re-authoring fourteen boxes by eye, not just faster:
    # the night boxes are KNOWN GOOD, so a bad day assignment can only come
    # from the transform or from SAM proposing differently, and both of those
    # show up on --map. Regenerate with the snippet in the commit that added
    # these if either plate is ever re-exported.
    #
    # ⚠️ --map BEFORE CUTTING. Two Underground cards shipped as solid
    # rectangles because that step was skipped once already.
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
        # Stopping at the rooftops: below y 235 the box starts claiming
        # towers, and the buildings must not move. Clouds travel; the skyline
        # is planted.
        ('clouds',      0,   0, 1536,  235),
        # THE SKY, kept as a layer rather than dropped. Normally the sky is
        # never a card — it is the background every silhouette is cut against
        # and it is already the base plate. But clouds that TRAVEL have to
        # pass behind the skyline and behind the logo, and that means the
        # picture has to be split into what is behind them and what is in
        # front. This is the "behind".
        #
        # THE BOX IS DELIBERATELY EMPTY. This entry exists only to tell the
        # matcher above that this scene wants the sky kept; the mask is routed
        # there by the sky test, never by containment. A real full-plate box
        # here turns the entry into a catch-all that contains every mask in
        # the picture — tried it, and `sky` came back with 156 masks and two
        # thirds of the plate, with `unassigned` at zero.
        ('sky',         0,   0,    0,    0),
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
            # ...unless the scene asks for it. A still scene with travelling
            # clouds needs the plate split into what is behind them and what
            # is in front, and the sky IS the behind. See the 'sky' note in
            # the title region list.
            if any(reg[0] == 'sky' for reg in regions):
                groups.setdefault('sky', []).append(r['i'])
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
