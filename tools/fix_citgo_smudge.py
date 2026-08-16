#!/usr/bin/env python3
"""Repair the grey smudge painted beside CITGO's final O on the night plate.

Client, from the live game at night: "the CITGO sign — it looks to be like
some noise or a blurry error or something like that there. I saw one that
corrected and clean." He is right on both counts: the DAY plate's sign ends
clean, and the NIGHT plate carries a grey wash smeared across the fascia
right of the O — a generation artifact baked into the painting itself, at
roughly x775-825, y95-165 of eav-base.webp.

⚠️ THREE WRONG THEORIES DIED BEFORE THIS FILE, in order, and the trail is
worth keeping: the card/base parallax double (present day AND night; day is
clean, so no); the neon relight pass (a soft radial glow cannot print a
letter-shaped ghost); and "the ROI wall at x852 clips the lettering" — built,
shipped to a working tree, and reverted, because the brightness probe that
"confirmed" letters running to x952 was actually reading the LIT FENCE TOPS.
The sign art ends at ~x830; nothing was clipped. The ghost is in the paint.

WHAT THIS DOES. Masks the smudge — bright, low-saturation pixels in a tight
window right of the O, none of which belong to the letters (the O ends at
~x775 and the mask starts at 779) — and repairs them with OpenCV's Telea
inpaint, which rebuilds from the immediately surrounding fascia red, fence
tan and sky. The repair is applied to the BASE, and then the IDENTICAL
repaired pixels are copied into the citgo CARD wherever its alpha covers the
same coordinates — the card is the base's own pixels by construction, and
repairing the two separately would un-register them, which is the exact
doubling disease the multiplane fights everywhere else.

The letters are proven untouched: every pixel with the letters' own
signature (bright AND low-sat AND x < 779) must be bit-identical after.

    python3 tools/fix_citgo_smudge.py            # report + previews only
    python3 tools/fix_citgo_smudge.py --write
"""

import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
BG = ROOT / 'src' / 'assets' / 'backgrounds'

# The window the smudge lives in, measured off shots/citgo-tight.png with
# column markers. The O's rightmost column is ~775; 779 leaves its
# anti-aliased edge alone.
X0, X1, Y0, Y1 = 779, 828, 92, 168


def main():
    write = '--write' in sys.argv
    base = np.array(Image.open(BG / 'eav-base.webp').convert('RGB'))
    card = np.array(Image.open(BG / 'eav-citgo.webp').convert('RGBA'))

    reg = base[Y0:Y1, X0:X1].astype(int)
    mx = reg.max(axis=2)
    mn = reg.min(axis=2)
    # The smudge is a grey wash: bright-ish and unsaturated, on a fascia that
    # is strongly red and a fence that is strongly tan — both saturated, both
    # excluded by the sat test rather than by drawing an outline.
    smudge = (mx > 100) & ((mx - mn) < 55)
    mask = np.zeros(base.shape[:2], np.uint8)
    mask[Y0:Y1, X0:X1] = smudge.astype(np.uint8) * 255
    mask = cv2.dilate(mask, np.ones((3, 3), np.uint8), iterations=1)
    n = int((mask > 0).sum())
    print(f'smudge mask: {n} px in x{X0}-{X1} y{Y0}-{Y1}')

    repaired = cv2.inpaint(base, mask, 4, cv2.INPAINT_TELEA)

    # The letters must not move a single level.
    lm = np.zeros(base.shape[:2], bool)
    lreg = base[Y0:Y1, 700:779].astype(int)
    lmx = lreg.max(axis=2)
    lmn = lreg.min(axis=2)
    lm[Y0:Y1, 700:779] = (lmx > 150) & ((lmx - lmn) < 70)
    same = np.array_equal(repaired[lm], base[lm])
    print(f'letters untouched: {same} ({int(lm.sum())} px checked)')

    # Same pixels into the card, only where the card already covers them.
    card_out = card.copy()
    covered = (card[..., 3] > 8) & (mask > 0)
    card_out[covered, 0:3] = repaired[covered]
    print(f'card: {int(covered.sum())} px re-registered to the repaired base')

    # Before/after strip for the eyeball pass.
    y0, y1, x0, x1 = 70, 190, 700, 900
    strip = np.concatenate([
        base[y0:y1, x0:x1], np.full((y1 - y0, 4, 3), 255, np.uint8),
        repaired[y0:y1, x0:x1]], axis=1)
    Image.fromarray(strip).resize(((x1 - x0) * 2 * 2 + 8, (y1 - y0) * 2),
                                  Image.NEAREST).save(ROOT / 'shots' / 'citgo-repair.png')
    print('wrote shots/citgo-repair.png (left=before, right=after)')

    if not same:
        print('REFUSING: the repair reached the letters.')
        sys.exit(1)
    if write:
        Image.fromarray(repaired).save(BG / 'eav-base.webp', quality=95, method=6, lossless=True)
        Image.fromarray(card_out).save(BG / 'eav-citgo.webp', quality=95, method=6, lossless=True)
        print('wrote eav-base.webp and eav-citgo.webp')
    else:
        print('report only — pass --write to repair')


if __name__ == '__main__':
    main()
