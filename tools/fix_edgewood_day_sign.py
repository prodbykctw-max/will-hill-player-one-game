#!/usr/bin/env python3
"""
Make the Edgewood DAY plate's neon read OUR BAR, like the night plate does.

The client's day export came back saying COLOUR BAR while the night one says
OUR BAR — same bar, same window, two different names depending on the time of
day. This fixes the day plate to match.

WHY THE LETTERS ARE MOVED, NOT REDRAWN. "COLOUR" already contains "OUR" as its
last three glyphs, in the right font, at the right size, with the right neon
glow and the right colour. Anything typed over the top would be a different
letterform sitting in a pixel-art plate, and it would show. So the O, U and R
are lifted out of the word as pixels and slid left; nothing is drawn.

WHY IT IS RECENTRED. Simply erasing "COL" would leave OUR sitting where the
end of COLOUR was — 17px right of centre against the BAR beneath it, which
reads as a mistake rather than as a name. The three letters move so their
centre matches BAR's.

THE HOLE IS INPAINTED. The panel interior is an out-of-focus window with soft
shapes in it, so the letters are keyed by their own neon colour and only that
footprint is filled — the first attempt tiled a clean column strip across the
whole line and it read as exactly what it was, a lighter rectangle pasted over
a window.

Idempotent-ish but not safe to run twice — it works on whatever is currently
in the file. Re-run from a fresh export if the plate is ever replaced.

    python3 tools/fix_edgewood_day_sign.py [--preview]
"""
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

from cut_planes import pyramid_inpaint

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLATE = os.path.join(ROOT, 'src', 'assets', 'backgrounds', 'edgewood-day.webp')

# Measured off the plate by keying the warm neon, not estimated:
#   COLOUR  rows 204..224, glyphs C 68-78  O 81-91  L 95-104
#                                 O 106-117 U 120-131 R 134-145
#   BAR     rows 234..255, glyphs B 85-96  A 100-114 R 119-131
OUR_X0, OUR_X1 = 105, 152      # the O of OUR, minus a hair, to R plus its glow
BAND_Y0, BAND_Y1 = 194, 232    # the whole COLOUR line plus glow, top and bottom
WIPE_X0, WIPE_X1 = 60, 156     # the full width of the line inside the panel
COLOUR_CENTRE = (68 + 145) / 2
BAR_CENTRE = (85 + 131) / 2


def main():
    preview = '--preview' in sys.argv
    im = Image.open(PLATE).convert('RGB')
    a = np.asarray(im).astype(np.uint8).copy()

    band = (slice(BAND_Y0, BAND_Y1), slice(WIPE_X0, WIPE_X1))
    sub = a[band].astype(int)
    lum = (sub * [0.30, 0.59, 0.11]).sum(2)
    neon = (sub[..., 0] > 120) & (sub[..., 1] > 90) & (sub[..., 2] < 170) & (lum > 90)

    # THE HOLE IS INPAINTED, NOT PATCHED OVER. The first pass tiled a clean
    # column strip across the whole line and it read as exactly what it was —
    # a lighter rectangle with a repeating shape in it, pasted over a window.
    # Keying the neon and filling only where the LETTERS were leaves the
    # panel's own out-of-focus interior untouched everywhere else.
    hole = np.zeros(a.shape[:2], bool)
    hole[band] = ndi.binary_dilation(neon, np.ones((7, 7), bool))
    base = pyramid_inpaint(a, hole)

    # Put OUR back, shifted left onto BAR's centre. Neon over a dark panel is
    # additive light, so the brighter of the two wins: that carries the glow's
    # soft falloff instead of stamping a rectangle of old background down.
    glyph_lo, glyph_hi = 106, 145
    new_lo = round(BAR_CENTRE - (glyph_hi - glyph_lo) / 2)
    shift = glyph_lo - new_lo
    src = a[BAND_Y0:BAND_Y1, OUR_X0:OUR_X1].astype(int)
    dst = base[BAND_Y0:BAND_Y1, OUR_X0 - shift:OUR_X1 - shift].astype(int)
    base[BAND_Y0:BAND_Y1, OUR_X0 - shift:OUR_X1 - shift] = np.maximum(dst, src).astype(np.uint8)

    out = Image.fromarray(base)
    if preview:
        pth = '/tmp/edgewood_day_sign.png'
        out.crop((50, 185, 175, 305)).resize((125 * 5, 120 * 5), Image.NEAREST).save(pth)
        print(f'preview -> {pth}  (OUR moved {shift}px left, centred on BAR)')
        return
    out.save(PLATE, quality=92, method=6)
    print(f'{PLATE}: COLOUR BAR -> OUR BAR (OUR moved {shift}px left)')


if __name__ == '__main__':
    main()
