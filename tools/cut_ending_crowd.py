#!/usr/bin/env python3
"""
Lift the crowd off the SHOWTIME ending so it can sway.

Client: *"the crowd sway cut — whoever was supposed to do that after I got the
shit flat, I want them to go [do it]."* His earlier call was *"ship it flat
first, re-cut after"*, and this is the re-cut.

WHY NOT tools/cut_still.py. That tool is right in shape and wrong in inputs
here, on two counts that would both have destroyed artwork:

  * it reads `ending.webp`, which is still the OLD 1536x1024 LANDSCAPE painting
    the client replaced. Running `cut_still.py ending` would have cut the wrong
    picture and written the result over the good plate.
  * its masks — tools/sam_masks/ending/{crowd,hero,prompt}.png — are all
    1536x1024, cut from that same landscape plate, against an 853x1843
    painting. They map to nothing.

And a new SAM pass is not available: torch, segment_anything and cv2 are all
absent from this container and tools/captures/sam/ is empty. So the mask is
authored here, by geometry, against the plate's own coordinates.

⚠️ A SWAY DOES NOT NEED A CUTOUT, IT NEEDS A BAND. This is the thing that makes
a hand mask good enough. The crowd is not being relocated or composited
somewhere else — it is drawn back exactly over its own footprint and sheared a
couple of pixels about a pivot at its feet. At rest the composite is the
painting, pixel for pixel. All the mask has to do is (a) contain the crowd and
(b) have its edges land somewhere a two-pixel shear cannot be read.

WHERE THE EDGES LAND, AND WHY EACH ONE IS SAFE:

    left   x=140   Will Hill is on stage to the left of this; measured, his
                   body spans x0-130 at every row of the band. The gap between
                   him and the front row is unlit, so the one edge that cuts
                   across content cuts across shadow.
    top            a slope from (140,868) to (853,726), following the head
                   line. Above it is the dark rear wall of the room.
    bottom y=1596  below the front row, in the black of the stage lip. The
                   pivot sits here, so this edge does not move at all.
    right  x=853   the plate edge.

⚠️ AND THE FEATHER IS 9PX, NOT cut_still.py's 1.1. That tool feathers a SAM
cutout whose edge already follows the object; this is a straight line ruled
through a painting, and a hard line shifting two pixels reads instantly. Nine
pixels of gradient over a two-pixel shear means no column ever changes by more
than a fifth of its own value.

⚠️ RE-RUNNABLE, BECAUSE THE SOURCE IS NEVER THE OUTPUT. It reads
`ending-plate.webp` — the pristine painting — and writes `ending-base.webp`
(inpainted under the crowd) and `ending-crowd.webp` (the card). Running it
twice gives the same answer. The one-shot trap that
tools/scrub_stage_clouds.py fell into, where a second run eats its own output,
cannot happen here.

Usage:
    python3 tools/cut_ending_crowd.py --check      # report, write nothing
    python3 tools/cut_ending_crowd.py --write
"""

import os
import shutil
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cut_planes import pyramid_inpaint          # noqa: E402  same filler as the stage cutter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BG = os.path.join(ROOT, 'src', 'assets', 'backgrounds')

PLATE = os.path.join(BG, 'ending-plate.webp')   # pristine source of truth
BASE = os.path.join(BG, 'ending-base.webp')     # what the game draws
CARD = os.path.join(BG, 'ending-crowd.webp')    # the mover

SRC_W, SRC_H = 853, 1843
CROWD = [(140, 868), (300, 800), (520, 752), (853, 726),
         (853, 1596), (140, 1596)]
FEATHER = 9.0


def main():
    write = '--write' in sys.argv

    # First run: the plate the game currently draws IS the pristine painting,
    # because nothing has ever been cut from it. Promote it to the source of
    # truth so every later run reads an uncut picture.
    if not os.path.exists(PLATE):
        if not os.path.exists(BASE):
            raise SystemExit('no ending-base.webp to promote')
        if write:
            shutil.copyfile(BASE, PLATE)
            print(f'promoted ending-base.webp -> ending-plate.webp (pristine source)')
        else:
            print('would promote ending-base.webp -> ending-plate.webp')

    src = PLATE if os.path.exists(PLATE) else BASE
    im = Image.open(src).convert('RGB')
    if im.size != (SRC_W, SRC_H):
        raise SystemExit(f'expected {SRC_W}x{SRC_H}, got {im.size} — re-measure CROWD')
    rgb = np.asarray(im)

    m = Image.new('L', im.size, 0)
    ImageDraw.Draw(m).polygon(CROWD, fill=255)
    mask = np.array(m) > 0
    print(f'crowd mask {int(mask.sum())}px '
          f'({100 * mask.sum() / (SRC_W * SRC_H):.0f}% of the plate)')

    # The card: the painting's own pixels, alpha'd to the band.
    a = ndi.gaussian_filter(mask.astype(np.float32), FEATHER)
    a = np.clip(a, 0, 1)
    card = np.dstack([rgb, (a * 255 + 0.5).astype(np.uint8)])

    # The base under it. Only ever seen along the sheared edge, which is why
    # the fill only has to be plausible rather than perfect — and it is the
    # same pyramid fill the stage cutter uses, not a blur invented here.
    filled = pyramid_inpaint(rgb, ndi.binary_dilation(mask, iterations=2))

    print(f'  card alpha: {int((a > 0.5).sum())}px over half, '
          f'{int((a > 0.02).sum())}px total')
    if not write:
        print('  --check — nothing written')
        return
    Image.fromarray(card).save(CARD, 'WEBP', quality=94, method=6, exact=True)
    Image.fromarray(filled).save(BASE, 'WEBP', quality=92, method=6)
    print(f'  wrote {os.path.basename(CARD)} and {os.path.basename(BASE)}')


if __name__ == '__main__':
    main()
