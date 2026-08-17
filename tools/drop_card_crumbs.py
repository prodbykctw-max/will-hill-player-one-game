#!/usr/bin/env python3
"""
Erase stray crumbs that a SAM cut left on the wrong card.

WHAT THIS FIXES, IN THE CLIENT'S WORDS: "underground still has double
buildings in the background", and earlier, pointing at the sign itself, "P
PEACHTREE". The Underground's PEACHTREE FURNITURE board rendered with an extra
capital P in front of it, in daylight, in a gameplay video — and only in
motion, which is why still frames of the plate kept coming back clean.

WHAT IT ACTUALLY WAS. Not a doubled building and not a bad plate. The base
plate is clean, and base + every card recomposed at zero offset is clean. The
segmenter had handed the `lamps` card a 10x19px crumb of the sign's own P —
the letter sits right beside the lamppost and reads as part of it to a
grid-sampled mask. `lamps` is the nearest card on that stage at depth 0.78,
which is +15px of separation from the base at the far end of the stage: almost
exactly one letter width. So the crumb printed the P a letter to the left of
where the base plate already had it, and the sign read "P PEACHTREE".

Found by muting one card at a time in a live frame — `span = [0,0]` on each in
turn — until the artifact went. Muting `lamps` fixed it; muting `trees` (which
holds the whole signboard) did not. Worth remembering: the card that OWNS the
object is not necessarily the card printing the ghost of it.

WHY DELETING FROM THE CARD IS LOSSLESS. The base plate keeps a full copy of
everything a card redraws — that is the invariant the whole parallax scheme
rests on, and it is why ghost amplitude equals depth amplitude. So a pixel
removed from a card is still painted, by the base, at the position it belongs
in. Removal can leave a hole in the parallax, never a hole in the picture.
That is what makes this safe in a way that erasing from the BASE would not be,
and it is why tools/erase_carded.py — which tried the opposite, punching card
regions out of the base and filling them — was built, measured, and abandoned.

WHY A RECT TABLE AND NOT A SIZE THRESHOLD. The obvious rule, "drop components
under N px", is wrong here and would ship a visible regression: the same card
carries a 192px sliver at x354-360 that is the lower half of the second
lamppost's pole, directly beneath its 680px upper half. Dropping it by size
leaves a streetlight floating in the air. Crumbs are identified by WHERE they
are, against the plate, by eye, and written down.

Re-runnable: erasing an already-erased region is a no-op, so this can be run
again after any re-cut of the plates. Run it AFTER cut_planes.py and
scrub_stage_clouds.py, never before — cut_planes rewrites the cards.

Usage:
    python3 tools/drop_card_crumbs.py            # apply every entry
    python3 tools/drop_card_crumbs.py --check    # report only, touch nothing
"""

import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BG = os.path.join(ROOT, 'src', 'assets', 'backgrounds')

# (stage-card file stem, x0, y0, x1, y1, why)
# Coordinates are PLATE pixels, on the 1535x1024 plates.
CRUMBS = [
    ('underground-day-lamps', 1318, 340, 1335, 367,
     "the P of PEACHTREE FURNITURE, grouped onto the lamppost beside it. "
     "At lamps' depth 0.78 it prints ~15px left of the base's own P."),
]


def main():
    check = '--check' in sys.argv
    total = 0
    for stem, x0, y0, x1, y1, why in CRUMBS:
        path = os.path.join(BG, f'{stem}.webp')
        if not os.path.exists(path):
            print(f'{stem}: MISSING — skipped')
            continue
        im = Image.open(path).convert('RGBA')
        a = np.array(im)
        region = a[y0:y1, x0:x1, 3]
        n = int((region > 8).sum())
        print(f'{stem}  x {x0}..{x1} y {y0}..{y1}  {n} opaque px')
        print(f'    {why}')
        if not n:
            print('    already clear')
            continue
        total += n
        if check:
            continue
        a[y0:y1, x0:x1, 3] = 0
        Image.fromarray(a).save(path, quality=92, method=6)
        print(f'    erased -> {os.path.relpath(path, ROOT)}')
    print(f'\n{total} px {"would be" if check else ""} erased')


if __name__ == '__main__':
    main()
