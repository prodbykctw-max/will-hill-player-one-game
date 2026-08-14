#!/usr/bin/env python3
"""Two more cards off the portrait title: WILL HILL: and the sky's clouds.

WHY A COLOUR KEY AND NOT SAM. SAM cut this plate into five cards (logo, signL,
signR, hero, pole) and it could not find these two. The clouds have no edge it
can see — they dissolve into the sky rather than ending at one — and the
wordmark's white line got swallowed into the same region as the sky behind it.
Measured, not assumed: of the 39,674 gold pixels in the painting, 39,668 are
inside sam_masks/title-portrait/logo.png, and only 155 white ones are. So the
existing `tp_logo` card is PLAYER ONE and nothing else; WILL HILL: was never
cut and lives in the backdrop.

That is why the intro reads backwards right now. PLAYER ONE flies in as a card
and lands at tick 78; WILL HILL: cannot appear until the whole backdrop fades
up behind it at 78-104. His name arrives AFTER the line under it. The client:
"his name should appear and Player One appear last."

Both keys are colour + geometry, both are checked against a proof image, and
NOTHING IS INPAINTED. The base stays the whole uncut painting — the rule this
project settled on after "bruises everywhere" — so these cards land back
exactly on top of their own twins and there is no hole to fill.
"""
import json
import os
import sys

import numpy as np
import scipy.ndimage as ndi
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
BG = os.path.join(HERE, '..', 'src', 'assets', 'backgrounds')
PLATE = os.path.join(BG, 'title-portrait.webp')
PLANES = os.path.join(BG, 'title-portrait-planes.json')

# The wordmark band, read off the plate: WILL HILL: is the white line, PLAYER
# ONE the gold one under it. x is clamped inside the text so the red stars at
# either end and the clouds behind them cannot join the card.
BAND = (150, 430)
# MEASURED, not eyeballed. Every glyph of WILL HILL: spans y 172-258 and the
# whole line spans x 173-697 including the colon. A first pass at x 80-835
# also caught three cloud wisps either side of the text — 1,258px on the right
# at x758-832 and three specks on the left under x112 — and y cannot separate
# them because the right wisp sits at y212-255, right through the letters. x
# can, cleanly, with room to spare on both sides.
TEXT_X = (155, 715)
WHITE_MAX_Y = 278       # below this row the bright pixels are gold bevel

# Only the TOP cloud bank is cut. The lower puffs sit against the skyline
# rather than flat sky, and a card that overlaps buildings cannot move without
# showing what is behind it.
SKY_ROWS = (0, 165)
MIN_CLOUD_PX = 220      # anything smaller is a lit window or a star point
FEATHER = 1.1


def channels(rgb):
    mx = rgb.max(2)
    mn = rgb.min(2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    return mx, sat


def cut_wordmark(rgb):
    """WILL HILL: — bright, unsaturated, on the top line of the band."""
    mx, sat = channels(rgb)
    m = (mx > 150) & (sat < 0.22)
    keep = np.zeros(m.shape, bool)
    keep[BAND[0]:WHITE_MAX_Y, TEXT_X[0]:TEXT_X[1]] = True
    m &= keep
    # The letters carry a hard black outline that the brightness key drops.
    # Close it back on, then fill, or every glyph comes out hollow.
    m = ndi.binary_fill_holes(ndi.binary_closing(m, np.ones((5, 5), bool)))
    return drop_specks(m, 200)


def cut_clouds(rgb):
    """The top cloud bank, by lift over each row's own sky median."""
    mx, sat = channels(rgb)
    lum = rgb.astype(np.float32).mean(2)
    band = np.zeros(lum.shape, bool)
    band[SKY_ROWS[0]:SKY_ROWS[1], :] = True
    # A row's sky level is its own median — the gradient runs top to bottom, so
    # one global threshold would take the whole top of the plate.
    rowbg = np.array([np.median(lum[y]) for y in range(lum.shape[0])], np.float32)
    m = band & ((lum - rowbg[:, None]) > 10) & (sat < 0.30)
    m = ndi.binary_fill_holes(ndi.binary_closing(m, np.ones((3, 3), bool)))
    return drop_specks(m, MIN_CLOUD_PX)


def drop_specks(m, min_px):
    lab, n = ndi.label(m)
    if not n:
        return m
    sizes = ndi.sum(m, lab, range(1, n + 1))
    small = {i for i, s in enumerate(sizes, 1) if s < min_px}
    return m & ~np.isin(lab, list(small)) if small else m


def alpha_of(m):
    a = ndi.gaussian_filter(m.astype(np.float32), FEATHER)
    a = np.clip((a - 0.32) / 0.5, 0, 1)
    return np.maximum(a, m.astype(np.float32))


def emit(rgb, m, name, planes):
    ys, xs = np.where(m)
    if not len(ys):
        raise SystemExit(f'{name}: empty mask')
    h, w = m.shape
    a = (alpha_of(m) * 255).astype(np.uint8)
    card = np.dstack([rgb, a])[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    out = os.path.join(BG, f'titlep-{name}.webp')
    Image.fromarray(card, 'RGBA').save(out, quality=95, method=6, lossless=False)
    planes[name] = {
        'px': int(m.sum()),
        'frac': [round(xs.min() / w, 4), round(ys.min() / h, 4),
                 round((xs.max() + 1) / w, 4), round((ys.max() + 1) / h, 4)],
    }
    print(f'  {name:9s} {int(m.sum()):7d}px  x {xs.min()}..{xs.max()}  '
          f'y {ys.min()}..{ys.max()}  -> titlep-{name}.webp')


def main():
    rgb = np.asarray(Image.open(PLATE).convert('RGB'))
    print(f'title-portrait {rgb.shape[1]}x{rgb.shape[0]}')

    word = cut_wordmark(rgb)
    clouds = cut_clouds(rgb)

    if '--proof' in sys.argv:
        proof = rgb.copy()
        proof[word] = [255, 0, 160]
        proof[clouds] = [0, 255, 160]
        p = '/tmp/title_extras_proof.png'
        Image.fromarray(proof).save(p)
        print(f'  -> {p}')
        return

    planes = json.load(open(PLANES))
    emit(rgb, word, 'wordmark', planes)
    emit(rgb, clouds, 'clouds', planes)
    json.dump(planes, open(PLANES, 'w'), separators=(',', ':'))
    print(f'  planes -> title-portrait-planes.json ({len(planes)} cards)')


if __name__ == '__main__':
    main()
