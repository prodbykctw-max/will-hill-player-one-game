#!/usr/bin/env python3
"""
Paint the OPTIONS word out of the title plate -- and out of every other file
that carries a copy of it.

WHY. On the home page the three controls are 12-14px tall - a third of a
usable tap target - and they are positioned by the PAINTING rather than by the
screen. OPTIONS lives at source row 1609 of 1844, so where it lands depends
entirely on how the cover-crop falls: bunched high with 80px of dead pavement
under it on a tall phone, crushed against the bottom edge with a 6px gap on an
iPhone SE. Client: "I'm not really comfortable with how start game, options
and music buttons are sitting."

The fix is to draw OPTIONS as a real control laid out from the bottom of the
screen. That requires the painted word to stop being there, or there would be
two of them.

⚠️ THE WORD IS IN THREE FILES, NOT ONE. This tool patched only the plate on
its first pass and the ghost survived on screen, which cost an hour to trace:

  * title-portrait.webp        the plate. Left PRISTINE - it is the archive
                               every other file here is cut from, and the
                               patch is derived from it. The game reads it
                               only for the hero's eyes.
  * title-portrait-nooptions   the settled plate the title actually draws.
                               Written from the plate.
  * title-portrait-bare        the intro's first beat. Same street, and the
                               assembly would show the word and then drop it.
  * title-portrait-skyline     THE ONE THAT CAUGHT US. It reads as "the
                               towers", but below the sky it is a byte-exact
                               copy of the whole plate (measured: meandiff
                               0.00 over the OPTIONS band), drawn full-frame
                               at depth 0.020 over the far clouds. So it
                               repainted the word back on top of the clean
                               plate, in the same place, at no parallax
                               offset - indistinguishable from the plate
                               never having been patched at all.

  Anything cut from the plate that keeps its pavement has to be patched too.
  Check with `--audit`, which reports the band's contrast in every file in
  this directory and needs no argument.

⚠️ ONLY THE WORD. PRESS START is his hero lettering and stays exactly as
painted - it sits ~40 rows above and is not touched. This is the narrowest
possible edit to the plate.

⚠️ RUN IT LAST. cut_title_clouds.py writes the skyline card, seal_skyline.py
patches it and cut_title_bare.py writes the bare plate, all from the pristine
original - so all three come back carrying the word and this has to run after
them.

HOW THE HOLE IS FILLED. The word sits on wet cobblestone that continues
unbroken below it, so the patch is cloned from the rows immediately underneath
and blended in with a feathered mask. Nearest-matching rows, because the
cobble's scale and the reflections both change with height - a clone from far
away reads as a pasted rectangle, which is the bruise this project has
rejected before (see the abandoned tools/erase_carded.py).

Each file is cloned from its OWN pixels rather than having the plate's patch
pasted into it, so each stays internally consistent and none of them inherits
another file's recompression noise.

Re-runnable: the clone comes from rows BELOW the word, which this never
touches, so a second run lays down the same patch over the first.

Usage:
    python3 tools/cut_title_options_out.py
    python3 tools/cut_title_options_out.py --preview
    python3 tools/cut_title_options_out.py --audit
"""

import os
import sys

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BG = os.path.join(ROOT, 'src', 'assets', 'backgrounds')
SRC = os.path.join(BG, 'title-portrait.webp')

# (source, destination, save kwargs). The plate is read and written
# elsewhere; the other two are patched where they lie.
#
# ⚠️ EACH FILE IS RE-SAVED THE WAY ITS OWN CUTTER SAVES IT. The skyline card
# is written LOSSLESS by cut_title_clouds.py and seal_skyline.py; a first pass
# here re-saved it at quality 94 like an ordinary card and took it from 1.41 MB
# to 397 KB - a full lossy pass over every tower on the plate, to patch 184x48
# pixels of pavement. Match the cutter, per file, or the patch costs more than
# it fixes.
TARGETS = [
    (os.path.join(BG, 'title-portrait.webp'),
     os.path.join(BG, 'title-portrait-nooptions.webp'),
     dict(quality=94, method=6)),
    (os.path.join(BG, 'title-portrait-bare.webp'),
     os.path.join(BG, 'title-portrait-bare.webp'),
     dict(quality=95, method=6)),          # cut_title_bare.py
    (os.path.join(BG, 'title-portrait-skyline.webp'),
     os.path.join(BG, 'title-portrait-skyline.webp'),
     dict(lossless=True)),                 # cut_title_clouds.py / seal_skyline.py
]

# The word, from OPTIONS_BOX in src/render/title.js, plus a margin for the
# dark outline and antialiasing the box itself does not include.
X0, Y0, X1, Y1 = 334, 1599, 518, 1647
# How far below to take the clone from. Far enough to be clear of the word's
# own outline, near enough that the cobble still matches.
CLONE_DROP = 58
# ⚠️ THE FEATHER GOES OUTSIDE THE WORD, NOT INSIDE IT. A first pass built the
# ramp by insetting the solid region and blurring, which pushed the ramp INWARD
# over the lettering - the patch went on at partial opacity across the word's
# own dark outline and left a legible grey ghost of OPTIONS on the pavement.
# The solid region has to cover the whole word; only the added margin ramps.
FEATHER = 6

# A clean band measures ~28; the word measures ~164. Anything above this is
# carrying lettering.
CLEAN_CONTRAST = 70


def band_contrast(path):
    """p99 - p1 of luminance over the word's rows. The word is high-contrast
    pale type on dark cobble, so this separates cleanly and needs no template
    matching."""
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.int32)
    if a.shape[0] < Y1 or a.shape[1] < X1:
        return None
    band = a[Y0 - 4:Y1 + 4, X0 - 4:X1 + 4]
    return float(np.percentile(band, 99) - np.percentile(band, 1))


def audit():
    """Every image in the backgrounds directory that is plate-shaped, and
    whether it still has the word in it."""
    ref = Image.open(SRC).size
    print(f'OPTIONS band x {X0}..{X1} y {Y0}..{Y1}   '
          f'clean is under {CLEAN_CONTRAST}')
    for name in sorted(os.listdir(BG)):
        if not name.endswith('.webp'):
            continue
        path = os.path.join(BG, name)
        if Image.open(path).size != ref:
            continue
        c = band_contrast(path)
        if c is None:
            continue
        # The plate itself is MEANT to keep the word - it is the archive the
        # patch is derived from, and nothing draws its pavement.
        flag = ('ARCHIVE' if path == SRC
                else 'WORD' if c >= CLEAN_CONTRAST else 'clean')
        print(f'  {flag:7s} {c:6.1f}  {name}')


def paint_out(src, dst, save):
    im = Image.open(src)
    alpha = im.getchannel('A') if im.mode in ('RGBA', 'LA') else None
    a = np.array(im.convert('RGB'))

    # Work on the word rect PLUS the feather margin, so the ramp has somewhere
    # to live that is not on top of the lettering.
    ox0, oy0 = X0 - FEATHER, Y0 - FEATHER
    ox1, oy1 = X1 + FEATHER, Y1 + FEATHER
    ow, oh = ox1 - ox0, oy1 - oy0
    patch = a[oy0 + CLONE_DROP:oy1 + CLONE_DROP, ox0:ox1].copy()
    # Flip it. The cobble rows run in courses; a straight copy can line two
    # identical courses up one above the other and read as a repeat, where a
    # mirrored one interleaves them.
    patch = patch[::-1]

    # Solid across the word itself, ramping to nothing through the margin.
    m = Image.new('L', (ow, oh), 0)
    m.paste(255, (FEATHER, FEATHER, ow - FEATHER, oh - FEATHER))
    m = m.filter(ImageFilter.GaussianBlur(FEATHER * 0.6))
    mask = np.array(m).astype(np.float32)[..., None] / 255.0

    keep = a[oy0:oy1, ox0:ox1].astype(np.float32)
    a[oy0:oy1, ox0:ox1] = (patch.astype(np.float32) * mask
                           + keep * (1.0 - mask)).astype(np.uint8)

    out = Image.fromarray(a)
    if alpha is not None:
        # ⚠️ The skyline card's alpha is what makes it a card. The patch only
        # ever touches colour - putting it back opaque would paste a rectangle
        # of pavement over the far clouds.
        out = out.convert('RGBA')
        out.putalpha(alpha)
    out.save(dst, 'WEBP', **save)


def main():
    if '--audit' in sys.argv:
        audit()
        return
    preview = '--preview' in sys.argv
    print(f'OPTIONS painted out of x {X0}..{X1} y {Y0}..{Y1} '
          f'(clone from +{CLONE_DROP} rows, mirrored, {FEATHER}px feather)')
    for src, dst, save in TARGETS:
        before = band_contrast(src)
        rel = os.path.relpath(dst, ROOT)
        how = 'lossless' if save.get('lossless') else f"q{save['quality']}"
        if preview:
            print(f'  {rel}  band {before:.0f}  {how}  '
                  f'(--preview: nothing written)')
            continue
        was = os.path.getsize(dst) if os.path.exists(dst) else 0
        paint_out(src, dst, save)
        now = os.path.getsize(dst)
        # The size is printed because it is the tell for a wrong save mode:
        # patching 184x48 pixels must not move the file by megabytes.
        print(f'  {rel}  band {before:.0f} -> {band_contrast(dst):.0f}  '
              f'{how}  {was // 1024}K -> {now // 1024}K')


if __name__ == '__main__':
    main()
