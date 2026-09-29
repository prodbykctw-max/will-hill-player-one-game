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

1. HIS SKIN, MATCHED TO THE REAL WILL HILL — AND ONLY HIS
--------------------------------------------------------
Client: *"a little lighter/fairer skinned"*, then, after a first pass:
*"if you can Google him, the real Will Hill, and look at his skin tone... we're
trying to make that final ending image match his skin tone."*

MEASURED, NOT CHOSEN. His studio portrait (audiomack.com/realwillhill, a
black-and-white shot in a white T-shirt) gives his skin's lightness against
white: in linear light his cheeks reflect SKIN_TO_WHITE = 0.315 of what his
white shirt does. The painting ALSO has him in a white T-shirt, lit by the
same stage light as his face, so the target is simply 0.315 of the painted
shirt's brightness — measured off the plate every run (SHIRT box), not typed
in. The colour photos available (his album covers) are all colour-graded, so
they are not trusted for hue: the hue is a light-tan skin (ALBEDO) lit by the
plate's own light colour, which is the shirt's tint. CHROMA_MIX blends that
with the painted hue so his shading keeps its variety.

The painting is lit by one warm stage light, so his skin, the brick behind him
and the front row of the crowd are all the same orange-brown. A colour test
alone would lighten the wall and the fans. So the mask is his own geometry
first — his face and ear, the hand on the mic, the hand at his hip, traced off
the plate at 4x — and only then a warm-skin colour test inside it, feathered
so there is no cut line. Measured off the plate: the crowd's nearest arm is at
x>=227 beside his lower hand, and the mic itself starts at x~222; both are
outside every polygon.

The lift is in linear light and keeps each pixel's own shading: its
luminance is scaled by one gain, so the near-black beard, brows and glasses
frames stay dark and his face reads as HIS face rather than a pale mask.

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
      left   LABEL_LEFT (446)            under the W of SHOWTIME (W is x438-545)
      right  BOARD_RIGHT (808)           where his values always ended, x1.3
      top    BOARD_TOP                   below LEGEND UNLOCKED (ends y~361)
      bottom BOARD_TOP + scaled height   above the crowd's head line (726+)
    and the wall behind it — the PLAYER ONE sign included — is blacked out.
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
SKIN_TO_WHITE = 0.315   # his cheek / his white T-shirt, linear, from the photo
SHIRT = (100, 800, 200, 1010)   # his white T-shirt on the plate (x0, y0, x1, y1)
ALBEDO = (200, 152, 120)  # sRGB light-tan skin: hue only, lightness is measured
CHROMA_MIX = 0.6


def _lin(c):
    c = np.asarray(c, np.float32) / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def _srgb(v):
    v = np.clip(v, 0, 1)
    return 255.0 * np.where(v <= 0.0031308, 12.92 * v, 1.055 * v ** (1 / 2.4) - 0.055)


def _Y(v):
    return 0.2126 * v[..., 0] + 0.7152 * v[..., 1] + 0.0722 * v[..., 2]


def lighten_will(a, report=None):
    """a: HxWx3 int array (the plate). Returns a new array."""
    m = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(m)
    for poly in (FACE, MIC_HAND, HIP_HAND):
        d.polygon(poly, fill=255)
    hard = np.asarray(m) > 0
    geo = ndi.gaussian_filter(hard.astype(np.float32), 1.4)

    f = a.astype(np.float32)
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    luma = 0.299 * r + 0.587 * g + 0.114 * b
    # Warm skin under an orange light: red over blue, and not near-black.
    # Soft edges on both tests so a pixel on the boundary gets a partial lift.
    warm = np.clip((r - b - 8) / 20.0, 0, 1)
    lit = np.clip((luma - 14) / 22.0, 0, 1)
    w = (geo * warm * lit)[..., None]

    lin = _lin(f)
    Y = _Y(lin)
    # The white reference: the bright end of his painted T-shirt.
    x0, y0, x1, y1 = SHIRT
    # Only the SHIRT's pixels: the box also holds his black jacket, which
    # would read as a dim 'white' and make the target too dark.
    sh = lin[y0:y1, x0:x1].reshape(-1, 3)
    shirt_px = sh[luma[y0:y1, x0:x1].ravel() > 150]
    white = np.percentile(shirt_px, 90, axis=0)
    skin = hard & (r - b > 20) & (luma > 40)
    gain = SKIN_TO_WHITE * _Y(white) / float(np.median(Y[skin]))
    # His hue under this light: the albedo tinted by the shirt's own colour.
    tint = _lin(ALBEDO) * (white / white.max())
    chroma = tint / _Y(tint)
    own = lin / np.maximum(Y, 1e-6)[..., None]
    newY = (Y * gain)[..., None]
    target = newY * (chroma * CHROMA_MIX + own * (1 - CHROMA_MIX))
    out = _srgb(lin + (target - lin) * w)
    if report is not None:
        before = _srgb(np.median(lin[skin], axis=0))
        after = np.median(out[skin], axis=0)
        report.update(gain=gain, white=_srgb(white), before=before, after=after)
    return np.clip(out, 0, 255)


# ── 2. the board ────────────────────────────────────────────────────────────
# Client, second pass: "the score stats at the end of the game, we need to have
# that stretched out under the W a little more. So where it is on the right
# side of the image is perfectly fine. We just need it stretched out towards
# the left a little more to make it a little wider. You can modify the image
# if need be just to black out the background so you can pull that over."
#
# So the VALUES keep their right edge (BOARD_RIGHT) and the LABEL column moves
# left until it starts under the W of SHOWTIME — measured off his plate, the W
# runs x438-545 (S 212, H 287, O 364, W 438, T 555...). The PLAYER ONE sign
# sits behind the new left edge, so the wall behind the board is blacked out
# (BLACKOUT), feathered so there is no hard box.
BOARD_SCALE = 1.3
BOARD_RIGHT = 808     # right edge of the values column (unchanged)
LABEL_LEFT = 446      # left edge of the label column: just inside the W
BOARD_TOP = 398       # cap top of MONEY BAGS on the new board
PAD = 8               # air around the lettering's box, for its glow
BLACKOUT = (392, 378, W, 748)   # x0, y0, x1, y1 of the darkened wall
BLACKOUT_FEATHER = 12
BLACKOUT_KEEP = 0.16  # how much of the wall survives inside it


def _ink_mask(a):
    return (a.max(axis=2) > 95) & (a[..., 0] - a[..., 2] > 25)


def enlarge_board(a, rows, value_x):
    """
    a: the plate with values already emptied. rows: cut_ending_plate's
    (band top, band bottom, label end, value start) per row. value_x: right
    edge of his values. Returns (new plate, row_y, value_right): row_y(y)
    maps an old baseline to its new one, value_right is the new VALUE_X.
    """
    y0 = rows[0][0]
    y1 = rows[-1][1]
    ink = _ink_mask(a)
    band = np.zeros_like(ink)
    band[y0 - PAD:y1 + PAD, 500:value_x + PAD] = True
    letters = ink & band
    cols = np.where(letters.any(axis=0))[0]
    x0, x1 = int(cols.min()), int(cols.max()) + 1     # the LABELS only

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

    # Labels anchor LEFT at LABEL_LEFT; rows anchor top at BOARD_TOP.
    nx0 = round(LABEL_LEFT - PAD * k)
    ny0 = round(BOARD_TOP - PAD * k)
    if nx0 < BLACKOUT[0] or ny0 < 362 or ny0 + nh > 736 or nx0 + nw > BOARD_RIGHT - 90:
        raise SystemExit(f'labels would land at x{nx0}-{nx0 + nw} y{ny0}-{ny0 + nh} '
                         '— off the blacked-out wall, over the title or the crowd, or '
                         'into the values column; re-measure LABEL_LEFT / BOARD_TOP')

    # Black out the wall behind the board: a feathered box, darkened, not
    # painted flat, so the brick still reads faintly through it.
    m = np.zeros(a.shape[:2], np.float32)
    bx, byy, bxx, byyy = BLACKOUT
    m[byy:byyy, bx:bxx] = 1.0
    m = ndi.gaussian_filter(m, BLACKOUT_FEATHER)
    out = wall * (1.0 - m * (1.0 - BLACKOUT_KEEP))[..., None]

    out[ny0:ny0 + nh, nx0:nx0 + nw] += scaled

    def row_y(y):
        return BOARD_TOP + (y - y0) * k
    return np.clip(out, 0, 255), row_y, BOARD_RIGHT
