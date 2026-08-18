#!/usr/bin/env python3
"""
Lift his painted PRESS START off the title plate as a sprite, and repair the
pavement behind it.

WHY. Client: *"I literally sent you an image so why did you not do that and
who asked you to change the layout based on the phone type"* — and then,
after the layout was corrected: *"I just want uniformity across all devices
if possible."*

Uniformity is impossible while PRESS START is painted. It sits at a fixed
source row, the plate is scaled to cover the screen's WIDTH, so the pavement
left underneath it is whatever that phone's aspect ratio happens to leave:
measured, 133px on a Pro Max, 100 on a 412x780 Android, 45 on an iPhone SE,
against the ~90 his layout needs. Reserving the home-indicator strip in the
installed app takes another 34-59 off the same budget. That is the entire
reason some phones got his layout and some did not, and no amount of tuning
floors fixes it — the painting is deciding, and the painting cannot know how
tall the phone is.

So the word comes off the plate and is DRAWN with the others, and the whole
block — PRESS START, the contest bar, OPTIONS and MUSIC — is laid out from the
bottom of the usable screen. Same arrangement on every device, which is what
he asked for.

⚠️ IT IS HIS PAINTED LETTERING, NOT TYPE. The sprite is the actual pixels,
keyed out of the plate with their dark outline intact, saved LOSSLESS. He
reversed his own earlier "keep PRESS START painted" call to get uniformity;
that trade only holds if what gets drawn is still his artwork. Anything that
re-sets this in a font is not what was agreed.

HOW THE WORD IS FOUND. Gold glyphs and two red arrows on wet cobble, so the
key is saturation-and-value, not luminance — the pavement carries gold and red
REFLECTIONS at the same hues and a brightness key takes them too. What
separates them is structure: the glyphs are 12 solid components all sitting on
one baseline. Keep components of >=25px whose vertical centre is within 12px
of the median centre of the ten largest, and the reflections drop out on their
own. Measured on the shipped plate: 12 glyphs at cy 40.0-40.5, one reflection
blob at cy 71.0, cleanly separated.

Then the mask is dilated 2px to take in the dark outline the key does not
see — that outline belongs to the lettering, and without it the glyphs
composite with a hard bright edge.

⚠️ RUN IT AFTER cut_title_options_out.py. That tool rewrites
title-portrait-nooptions.webp from the pristine plate every run, which puts
this word straight back. It also has to have run first for another reason: the
clone that fills this hole comes from the rows just below, and those rows are
where his painted OPTIONS used to be. This refuses to run if it finds the word
still there.

Usage:
    python3 tools/cut_title_options_out.py      # first, always
    python3 tools/cut_title_prompt.py
    python3 tools/cut_title_prompt.py --preview
"""

import json
import os
import sys

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BG = os.path.join(ROOT, 'src', 'assets', 'backgrounds')
SRC = os.path.join(BG, 'title-portrait.webp')
SPRITE = os.path.join(BG, 'title-prompt.webp')
META = os.path.join(BG, 'title-prompt.json')

# Where to look. Generous around PROMPT in src/render/title.js; the tight rect
# is MEASURED from the key, not assumed, and written to the json.
X0, Y0, X1, Y1 = 180, 1505, 675, 1580

VAL_MIN = 0.38          # the glyphs are bright; the cobble under them is not
SAT_MIN = 0.55          # and they are saturated gold and red
MIN_BLOB = 25           # px, drops speckle
BAND_TOL = 12           # px from the baseline's median centre
OUTLINE = 2             # dilation that takes in the painted dark outline

# Same clone-and-feather repair as the OPTIONS cut. See that file for why the
# feather lives OUTSIDE the word rect and never ramps over the lettering.
CLONE_DROP = 58
FEATHER = 6

TARGETS = [
    (os.path.join(BG, 'title-portrait-nooptions.webp'), dict(quality=94, method=6)),
    (os.path.join(BG, 'title-portrait-bare.webp'), dict(quality=95, method=6)),
    (os.path.join(BG, 'title-portrait-skyline.webp'), dict(lossless=True)),
]

CLEAN_CONTRAST = 70     # a clean band measures ~28, the word ~165


def band_contrast(arr, x0, y0, x1, y1):
    band = arr[y0 - 4:y1 + 4, x0 - 4:x1 + 4]
    return float(np.percentile(band, 99) - np.percentile(band, 1))


def find_word(a):
    """The lettering's mask, in FULL-PLATE coordinates."""
    sub = a[Y0:Y1, X0:X1].astype(np.float32)
    mx, mn = sub.max(2), sub.min(2)
    val = mx / 255.0
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    lab, n = ndimage.label((val > VAL_MIN) & (sat > SAT_MIN))
    blobs = []
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        if sl is None:
            continue
        size = int((lab[sl] == i).sum())
        if size < MIN_BLOB:
            continue
        ys = sl[0]
        blobs.append((size, i, (ys.start + ys.stop) / 2))
    if not blobs:
        sys.exit('found no lettering — the key or the search box is wrong')
    blobs.sort(key=lambda b: -b[0])
    # ⚠️ THE BASELINE IS WHAT REJECTS THE REFLECTIONS. A size cut alone keeps
    # a 54px blob of reflected gold sitting 30 rows below the words.
    baseline = float(np.median([b[2] for b in blobs[:10]]))
    keep = [b[1] for b in blobs if abs(b[2] - baseline) <= BAND_TOL]
    mask = np.isin(lab, keep)
    mask = ndimage.binary_dilation(mask, np.ones((3, 3), bool), iterations=OUTLINE)
    full = np.zeros(a.shape[:2], bool)
    full[Y0:Y1, X0:X1] = mask
    return full, len(keep), len(blobs) - len(keep)


def repair(a, x0, y0, x1, y1):
    """Clone the pavement from just below, mirrored, feathered outside the rect."""
    ox0, oy0, ox1, oy1 = x0 - FEATHER, y0 - FEATHER, x1 + FEATHER, y1 + FEATHER
    ow, oh = ox1 - ox0, oy1 - oy0
    patch = a[oy0 + CLONE_DROP:oy1 + CLONE_DROP, ox0:ox1].copy()[::-1]
    m = Image.new('L', (ow, oh), 0)
    m.paste(255, (FEATHER, FEATHER, ow - FEATHER, oh - FEATHER))
    m = m.filter(ImageFilter.GaussianBlur(FEATHER * 0.6))
    k = np.array(m).astype(np.float32)[..., None] / 255.0
    keep = a[oy0:oy1, ox0:ox1].astype(np.float32)
    a[oy0:oy1, ox0:ox1] = (patch.astype(np.float32) * k
                           + keep * (1.0 - k)).astype(np.uint8)


def main():
    preview = '--preview' in sys.argv
    pristine = np.array(Image.open(SRC).convert('RGB'))
    mask, kept, dropped = find_word(pristine)
    ys, xs = np.nonzero(mask)
    bx0, by0, bx1, by1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
    print(f'PRESS START: {kept} glyphs kept, {dropped} reflection blob(s) dropped')
    print(f'  tight rect  x {bx0}..{bx1}  y {by0}..{by1}   ({bx1 - bx0}x{by1 - by0})')

    # ── the sprite: his pixels, his outline, nothing else ────────────────
    rgb = pristine[by0:by1, bx0:bx1]
    alpha = (mask[by0:by1, bx0:bx1] * 255).astype(np.uint8)
    sprite = Image.fromarray(np.dstack([rgb, alpha]), 'RGBA')

    if preview:
        print(f'  --preview: nothing written (sprite would be {sprite.size})')
        return

    # Lossless: it is 446x54 with alpha, it costs nothing, and a lossy pass
    # over hard-edged pixel lettering is exactly the recompression bruise this
    # project has paid for before.
    sprite.save(SPRITE, 'WEBP', lossless=True)
    json.dump({'x': bx0, 'y': by0, 'w': bx1 - bx0, 'h': by1 - by0,
               'srcW': int(pristine.shape[1]), 'srcH': int(pristine.shape[0])},
              open(META, 'w'), indent=2)
    print(f'  -> {os.path.relpath(SPRITE, ROOT)} ({sprite.size[0]}x{sprite.size[1]}, lossless)')

    # ── and the hole it leaves, in every file that carries the word ──────
    for path, save in TARGETS:
        im = Image.open(path)
        keep_alpha = im.getchannel('A') if im.mode in ('RGBA', 'LA') else None
        a = np.array(im.convert('RGB'))
        # The clone comes from the rows his OPTIONS used to occupy. If that
        # word is still there this would paste lettering into the hole.
        opt = band_contrast(a, 334, 1599, 518, 1647)
        if opt >= CLEAN_CONTRAST:
            sys.exit(f'REFUSING: {os.path.basename(path)} still has the painted '
                     f'OPTIONS (band {opt:.0f}) — run cut_title_options_out.py first')
        before = band_contrast(a, bx0, by0, bx1, by1)
        repair(a, bx0, by0, bx1, by1)
        out = Image.fromarray(a)
        if keep_alpha is not None:
            out = out.convert('RGBA')
            out.putalpha(keep_alpha)
        out.save(path, 'WEBP', **save)
        after = band_contrast(np.array(Image.open(path).convert('RGB')),
                              bx0, by0, bx1, by1)
        how = 'lossless' if save.get('lossless') else f"q{save['quality']}"
        print(f'  {os.path.relpath(path, ROOT)}  band {before:.0f} -> {after:.0f}  {how}')


if __name__ == '__main__':
    main()
