#!/usr/bin/env python3
"""
Reduce his SAVE & ENTER / YOUR ENTRY button to one word: ENTER.

Client: "That SAVE AND ENTER YOUR ENTRY statement is very redundant. Reduce it
to ENTER — remove SAVE and the sign and YOUR ENTRY and just leave ENTER."

⚠️ THIS EDITS HIS PAINTING, WHICH IS NORMALLY THE ONE THING NOT DONE HERE.
Every other tool in this directory crops or blanks; none of them changes what
he drew. This one does, because he asked for it directly. It still writes no
lettering of its own — the ENTER that survives is HIS ENTER, his glyphs, his
weight, lifted off the plate and put back with coverage so the anti-aliased
edges come with it.

WHAT IT DOES
------------
The gold disc is centred (418, 1182) with a radius of about 116; inside it his
dark lettering sits in three blocks, measured off the plate:

    SAVE &        y 1119-1168
    ENTER         y 1181-1228
    YOUR ENTRY    y 1244-1262

All three are painted out by replacing them, row by row, with the median of
the disc's own amber on that row — the disc is a radial gradient, so a row
median tracks it far better than one flat fill. Then his ENTER is composited
back at the disc's centre, scaled 1.2x: with the other two lines gone a word
at the original size reads lost on a 232px disc.

Run it against the plate and re-emit the WebP the game imports:

    python3 tools/edit_enter_button.py
    python3 -c "from PIL import Image; \\
        Image.open('assets/ui-concept/contest-entry.png').convert('RGB') \\
        .save('src/assets/ui/contest-entry.webp','WEBP',quality=82,method=6)"

The untouched original stays as contest-entry-3lines.png, so this can be
re-cut or reverted without asking him for the artwork again.
"""
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'ui-concept', 'contest-entry.png')
KEEP = os.path.join(ROOT, 'assets', 'ui-concept', 'contest-entry-3lines.png')

CX, CY, R = 418, 1182, 116
# ⚠️ THE THRESHOLD HAS TO CATCH THE HALO, NOT JUST THE CORE. His amber sums
# to about 390 across the three channels and the glyph cores to about 60, so
# an obvious cut at 320 looks safe — and it left readable ghosts of SAVE & and
# YOUR ENTRY behind, because the anti-aliased skirt of every letter lives in
# the 320-390 band and was treated as amber. Cut high and then dilate: a few
# extra pixels of amber replaced by amber costs nothing, and a few pixels of
# letter left behind is his old text showing through his new button.
INK_MAX = 355
ENTER = (1176, 1233)   # the row band to keep, with a little air
SCALE = 1.2


def dilate(mask, n):
    """Grow a boolean mask by n pixels in each direction. No scipy here, and
    four shifted ORs per step is plenty for something this small."""
    m = mask.copy()
    for _ in range(n):
        g = m.copy()
        g[1:, :] |= m[:-1, :]
        g[:-1, :] |= m[1:, :]
        g[:, 1:] |= m[:, :-1]
        g[:, :-1] |= m[:, 1:]
        m = g
    return m


def main():
    # ⚠️ ALWAYS RE-CUT FROM THE UNTOUCHED ORIGINAL. Running this twice against
    # its own output would inpaint an already-inpainted disc and blur his
    # ENTER a second time.
    if os.path.exists(KEEP):
        im = Image.open(KEEP).convert('RGB')
    else:
        im = Image.open(SRC).convert('RGB')
        im.save(KEEP)
        print('kept the three-line original at', os.path.basename(KEEP))
    a = np.asarray(im).astype(float)

    ys, xs = np.mgrid[0:a.shape[0], 0:a.shape[1]]
    d2 = (xs - CX) ** 2 + (ys - CY) ** 2
    disc = d2 < R * R
    lum = a.sum(2)
    # ⚠️ THE THRESHOLD HAS TO BE PER ROW. A single number cannot work on a
    # disc that is lit from above: his amber sums to ~390 across the top and
    # ~335 at the bottom, so a flat cut at 355 marked the ENTIRE lower band as
    # lettering, left no clean pixels to sample, and the row was skipped —
    # which is exactly why YOUR ENTRY survived the first two attempts while
    # SAVE & above it came out. Each row now measures its own amber and cuts
    # at 78% of it.
    ink = np.zeros(disc.shape, dtype=bool)
    for y in range(CY - R, CY + R + 1):
        d = disc[y]
        if int(d.sum()) < 12:
            continue
        amber_y = np.percentile(lum[y][d], 80)
        ink[y] = d & (lum[y] < amber_y * 0.78)
    ink = dilate(ink, 4) & disc

    # Coverage rather than a hard mask, so his edges survive the move.
    base = float(np.median(lum[disc & ~ink]))
    dark = float(np.percentile(lum[ink], 5))
    span = max(60.0, base - dark)
    cov = np.clip((base - lum) / span, 0, 1)
    cov[~disc] = 0

    # His ENTER, lifted before anything is painted out.
    y0, y1 = ENTER
    src_cov = cov[y0:y1].copy()
    src_ink = a[y0:y1].copy()

    # ── PAINT THE LINES OUT WITH THE DISC'S OWN RADIAL PROFILE ──────────
    # ⚠️ NOT A PER-ROW FILL. Filling each row with its own median left visible
    # horizontal banding across his button: every row got one flat colour, and
    # neighbouring rows disagreed slightly, so the cleared area read as a
    # smear rather than as metal. His disc is lit radially — a bright rim, a
    # soft fall-off inward — so the honest model is a profile by RADIUS, built
    # from the pixels that are not lettering and applied to the ones that are.
    # Bands cannot appear because neighbouring pixels at the same radius get
    # the same value by construction.
    out = a.copy()
    rad = np.sqrt(d2).astype(int)
    clean = disc & ~ink
    prof = np.zeros((R + 2, 3), dtype=float)
    last = np.median(a[clean], axis=0)
    for b in range(R + 2):
        m = clean & (rad == b)
        if int(m.sum()) >= 6:
            last = np.median(a[m], axis=0)
        prof[b] = last
    out[ink] = prof[np.clip(rad[ink], 0, R + 1)]

    # Put his ENTER back, centred on the disc and a fifth larger.
    h = y1 - y0
    w = a.shape[1]
    cov_im = Image.fromarray((src_cov * 255).astype(np.uint8))
    ink_im = Image.fromarray(np.clip(src_ink, 0, 255).astype(np.uint8))
    nw, nh = int(w * SCALE), int(h * SCALE)
    cov_s = np.asarray(cov_im.resize((nw, nh), Image.LANCZOS)).astype(float) / 255.0
    ink_s = np.asarray(ink_im.resize((nw, nh), Image.LANCZOS)).astype(float)

    # The scaled strip is centred on the disc's own centre.
    ox = int(CX - (CX * SCALE))          # x stays put: the strip is full width
    oy = int(CY - nh / 2)
    for y in range(nh):
        ty = oy + y
        if ty < 0 or ty >= a.shape[0]:
            continue
        for x in range(nw):
            tx = ox + x
            if tx < 0 or tx >= a.shape[1]:
                continue
            c = cov_s[y, x]
            if c <= 0.02:
                continue
            out[ty, tx] = out[ty, tx] * (1 - c) + ink_s[y, x] * c

    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(SRC)
    print('wrote', SRC)


if __name__ == '__main__':
    main()
