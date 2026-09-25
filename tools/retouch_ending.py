#!/usr/bin/env python3
"""
Two retouches to the SHOWTIME ending plate, applied by tools/cut_ending_plate.py
after it empties the eight stat values. Not run on its own.

Client, after playing it through:
  *"Can we make will hill in the ending screen a little lighter/fairer skinned?"*
  *"Can we make the end game stats section wider/larger?"*

⚠️ BOTH ARE APPLIED TO THE SOURCE, NEVER TO A SHIPPED FILE. cut_ending_plate.py
reads his untouched PNG (assets/ui-concept/ending-showtime-stats.png) and
writes ending-plate.webp; tools/cut_ending_crowd.py then cuts ending-base and
ending-crowd from that. Running the chain twice gives the same answer — a
retouch applied to its own output would lighten him again every run.

1. HIS SKIN, LIGHTER — AND ONLY HIS
-----------------------------------
The painting is lit by one warm stage light, so his skin, the brick behind him
and the front row of the crowd are all the same orange-brown. A colour test
alone would lighten the wall and the fans. So the mask is his own geometry
first — his face and ear, the hand on the mic, the hand at his hip, traced off
the plate at 4x — and only then a warm-skin colour test inside it, feathered
so there is no cut line. Measured off the plate: the crowd's nearest arm is at
x>=227 beside his lower hand, and the mic itself starts at x~222; both are
outside every polygon.

The lift is in light, not paint: each skin pixel is scaled toward a lighter,
slightly less saturated version of itself (SKIN_GAIN, SKIN_DESAT). Multiplying
leaves the near-black beard, brows and glasses frames almost where they were,
which is what keeps his face reading as HIS face rather than a pale mask.
"A little" was the ask — these are small numbers on purpose.

2. THE STATS BOARD, LARGER
--------------------------
His eight labels are painted lettering, and the rule on this plate is that
every word on it stays his (see cut_ending_plate.py). So the board is not
relettered in a system font — HIS lettering is lifted off the wall, scaled up
by BOARD_SCALE, and put back:

  * ink = plate - (plate with the lettering filled out of it). The wall is
    near-black, so the lettering is light ADDED to it; adding the scaled ink
    back onto the filled wall reproduces his gold on a new footprint without
    carrying a stretched patch of brick along with it.
  * the new footprint is chosen by what is around it, in plate pixels:
      left   BOARD_RIGHT - scaled width  clear of the PLAYER ONE sign (x<=481)
      top    BOARD_TOP                   below LEGEND UNLOCKED (ends y~361)
      bottom BOARD_TOP + scaled height   above the crowd's head line (726+)
  * src/render/ending.js draws the values; its ROW_Y / VALUE_X / VALUE_PX are
    printed by cut_ending_plate.py for the NEW board, never hand-edited.
"""
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

from cut_planes import pyramid_inpaint

W, H = 853, 1843

# ── 1. skin ─────────────────────────────────────────────────────────────────
# Plate pixels. Traced at 4x off ending-plate.webp.
FACE = [(106, 712), (118, 700), (128, 697), (160, 695), (184, 704), (187, 730),
        (180, 752), (171, 770), (146, 776), (126, 762), (112, 744)]
MIC_HAND = [(170, 738), (184, 733), (203, 731), (221, 737), (223, 757),
            (212, 768), (186, 769), (172, 761)]
HIP_HAND = [(180, 1008), (204, 1008), (217, 1028), (215, 1062), (196, 1070),
            (182, 1058), (177, 1032)]
SKIN_GAIN = 1.42      # brightness multiplier at full mask
SKIN_DESAT = 0.12     # pull toward its own grey, so it reads fairer, not neon


def lighten_will(a):
    """a: HxWx3 int array (the plate). Returns a new array."""
    m = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(m)
    for poly in (FACE, MIC_HAND, HIP_HAND):
        d.polygon(poly, fill=255)
    geo = ndi.gaussian_filter(np.asarray(m, dtype=np.float32) / 255.0, 1.4)

    f = a.astype(np.float32)
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    luma = 0.299 * r + 0.587 * g + 0.114 * b
    # Warm skin under an orange light: red over blue, and not near-black.
    # Soft edges on both tests so a pixel on the boundary gets a partial lift.
    warm = np.clip((r - b - 8) / 20.0, 0, 1)
    lit = np.clip((luma - 14) / 22.0, 0, 1)
    w = (geo * warm * lit)[..., None]

    grey = luma[..., None]
    lifted = (f + (grey - f) * SKIN_DESAT) * SKIN_GAIN
    out = f + (lifted - f) * w
    return np.clip(out, 0, 255)


# ── 2. the board ────────────────────────────────────────────────────────────
BOARD_SCALE = 1.3
BOARD_RIGHT = 808     # right edge of the values column on the new board
BOARD_TOP = 398       # cap top of MONEY BAGS on the new board
PAD = 8               # air around the lettering's box, for its glow


def _ink_mask(a):
    return (a.max(axis=2) > 95) & (a[..., 0] - a[..., 2] > 25)


def enlarge_board(a, rows, value_x):
    """
    a: the plate with values already emptied. rows: cut_ending_plate's
    (band top, band bottom, label end, value start) per row. value_x: right
    edge of his values. Returns (new plate, mapping) where mapping(x, y) gives
    a point's new position, so the caller can re-derive ROW_Y / VALUE_X.
    """
    y0 = rows[0][0]
    y1 = rows[-1][1]
    ink = _ink_mask(a)
    band = np.zeros_like(ink)
    band[y0 - PAD:y1 + PAD, 500:value_x + PAD] = True
    letters = ink & band
    cols = np.where(letters.any(axis=0))[0]
    x0 = int(cols.min())
    x1 = value_x

    # Fill the lettering out of the wall. Dilated so the anti-aliased skirt
    # and the faint glow go with it rather than leaving a ghost.
    hole = ndi.binary_dilation(letters, iterations=3)
    wall = pyramid_inpaint(a.astype(np.uint8), hole).astype(np.float32)

    # His lettering as light over that wall, in the old box.
    bx0, by0, bx1, by1 = x0 - PAD, y0 - PAD, x1 + PAD, y1 + PAD
    patch = a[by0:by1, bx0:bx1].astype(np.float32)
    under = wall[by0:by1, bx0:bx1]
    glow = np.clip(patch - under, 0, None)
    glow *= ndi.binary_dilation(hole[by0:by1, bx0:bx1], iterations=2)[..., None]

    k = BOARD_SCALE
    nw, nh = round((bx1 - bx0) * k), round((by1 - by0) * k)
    scaled = np.dstack([
        np.asarray(Image.fromarray(glow[..., c]).resize((nw, nh), Image.LANCZOS))
        for c in range(3)])
    scaled = np.clip(scaled, 0, None)

    # Anchor: old right edge (x1) -> BOARD_RIGHT, old cap top (y0) -> BOARD_TOP.
    def mapping(x, y):
        return (BOARD_RIGHT + (x - x1) * k, BOARD_TOP + (y - y0) * k)
    nx0 = round(mapping(bx0, by0)[0])
    ny0 = round(mapping(bx0, by0)[1])
    if nx0 < 482 or ny0 < 362 or ny0 + nh > 736 or nx0 + nw > W:
        raise SystemExit(f'board would land at x{nx0}-{nx0 + nw} y{ny0}-{ny0 + nh} '
                         '— over the sign, the title, the crowd or the edge; '
                         're-measure BOARD_SCALE / BOARD_RIGHT / BOARD_TOP')

    out = wall.copy()
    out[ny0:ny0 + nh, nx0:nx0 + nw] += scaled
    return np.clip(out, 0, 255), mapping
