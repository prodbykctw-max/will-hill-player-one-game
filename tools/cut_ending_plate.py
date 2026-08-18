#!/usr/bin/env python3
"""
Take his SHOWTIME plate and empty the eight stat values, so the run fills them.

Client: *"I have a much better and improved ending image."* It replaces the
1536x1024 landscape mockup outright — this one is 853x1843, the same shape as
the contest cabinet and the dashboard, so it fills a phone with three pixels to
spare instead of letterboxing a third of the screen away.

WHAT CHANGES ON IT, AND WHAT DOES NOT
-------------------------------------
Almost nothing changes. The old plate needed the word ENDING repainted as
SHOWTIME and five placeholder ROWS overwritten label-and-all; this one arrives
lettered correctly, because the stat list was settled with him first:

    MONEY BAGS · ENEMIES STOMPED · CHAMPAGNE · POTHOLES HIT
    BAGS ROBBED · DISTANCE · TIME · SCORE

⚠️ THE LIST IS THE GAME'S, AND IT COST TWO PASSES TO GET THERE. The first
version of this plate came back with the standard beat-em-up set — ENEMIES
DEFEATED / BOSSES DEFEATED / TIME / MAX COMBO / SCORE — which is the same list
`src/render/ending.js` already records rejecting once. This game has no bosses
(three separate comments in `src/world/` say so) and no combo meter. He
relettered it rather than have his artwork repainted, which is his standing
preference and the better outcome: every label on the shipped plate is his.

So the ONLY edit here is the eight placeholder VALUES he drew — 0, 0, 0, 0, 0,
0m, 0:03, $31,200. They are a screenshot of one real run and every one of them
is wrong for the next.

HOW THE VALUES ARE FOUND — the gap, not a column
------------------------------------------------
A single vertical cut cannot separate labels from values here: his longest
label (ENEMIES STOMPED) ends at x728 and his longest value ($31,200) starts at
x696, so they overlap in x and a column erase would eat the end of two labels.

Per row instead: find the widest internal gap in that row's ink, and erase from
the right-hand side of the gap outward. The gap between a left-aligned label
and a right-aligned value is always the widest thing in the row, so this is
exact — and it re-derives itself from the image, so a different placeholder in
a future pass is handled without touching this file.

The fill is a per-row median of that row's own non-ink pixels. His wall behind
the numbers is near-black and slightly textured brick, so a flat black leaves a
visible clean rectangle over a noisy wall.

Usage:
    python3 tools/cut_ending_plate.py            # write the asset + the geometry
    python3 tools/cut_ending_plate.py --preview  # + a contact sheet to /tmp
"""
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'ui-concept', 'ending-showtime-stats.png')
OUT = os.path.join(ROOT, 'src', 'assets', 'backgrounds', 'ending-base.webp')
PREVIEW_DIR = os.environ.get('PREVIEW_DIR', '/tmp')

W, H = 853, 1843
# The stat block. Row bands are the ink bboxes of his eight lines, found by
# scanning gold rows in x>420; the search window is deliberately generous
# because the point is to LOCATE them, not to trust these numbers.
BLOCK = (500, 450, 800, 730)     # x0, y0, x1, y1 — where the eight rows live
ERASE_TO = 792                   # right edge of the erase, clear of his values
GAP_MIN = 20                     # a label/value gap is never smaller than this


def rows_of(a):
    """His eight stat rows: (band top, band bottom, label end, value start)."""
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    # Both inks at once — his labels are deep gold (168,108,30) and his values
    # a paler gold (204,168,121), and this has to catch both to find the gap
    # BETWEEN them.
    ink = (a.max(axis=2) > 95) & (r - b > 25)
    x0, y0, x1, y1 = BLOCK
    sub = ink[y0:y1, x0:x1]
    out = []
    run = None
    for i, c in enumerate(sub.sum(axis=1)):
        if c > 4 and run is None:
            run = i
        elif c <= 4 and run is not None:
            if i - run > 8:
                seg = sub[run:i]
                cols = np.where(seg.any(axis=0))[0]
                gaps = []
                prev = cols[0]
                for c2 in cols[1:]:
                    if c2 - prev > GAP_MIN:
                        gaps.append((prev, c2, c2 - prev))
                    prev = c2
                if gaps:
                    lo, hi, _ = max(gaps, key=lambda t: t[2])
                    out.append((y0 + run, y0 + i, x0 + lo, x0 + hi))
            run = None
    return out


def main():
    im = Image.open(SRC).convert('RGB')
    if im.size != (W, H):
        raise SystemExit(f'expected {W}x{H}, got {im.size} — re-measure BLOCK')
    a = np.asarray(im).astype(np.int32)
    rows = rows_of(a)
    if len(rows) != 8:
        raise SystemExit(f'found {len(rows)} stat rows, expected 8 — look at '
                         f'--preview before trusting BLOCK: {rows}')

    ink = (a.max(axis=2) > 95) & (a[..., 0] - a[..., 2] > 25)
    out = a.copy()
    for top, bot, _lab_end, val_x0 in rows:
        # A little air around the band, so the value's anti-aliased skirt goes
        # with it rather than leaving a faint ghost of his old digits.
        t, b2 = max(0, top - 5), min(H, bot + 5)
        x = max(0, val_x0 - 6)
        for y in range(t, b2):
            clean = ~ink[y, x:ERASE_TO]
            if clean.sum() < 6:
                clean = ~ink[y, x - 40:ERASE_TO][:ERASE_TO - x]
            src = a[y, x:ERASE_TO][clean] if clean.sum() >= 6 else None
            out[y, x:ERASE_TO] = (np.median(src, axis=0) if src is not None
                                  else np.array([2, 2, 3]))

    img = Image.fromarray(out.astype(np.uint8), 'RGB')
    img.save(OUT, 'WEBP', quality=88, method=6)
    print(f'wrote {OUT}  {W}x{H}  {os.path.getsize(OUT) / 1024:.0f}KB')

    if '--preview' in sys.argv:
        p = os.path.join(PREVIEW_DIR, 'ending-emptied.png')
        img.crop((490, 440, 810, 740)).resize((640, 600), Image.NEAREST).save(p)
        print('preview:', p)

    # The numbers src/render/ending.js needs, printed rather than remembered.
    # VALUE_X is the right edge of his own values: they are right-aligned, so
    # every row agrees on it and the max is it.
    value_x = max(r[3] for r in rows)
    for top, bot, _le, vx in rows:
        seg = ink[top:bot + 1, vx:ERASE_TO]
        cols = np.where(seg.any(axis=0))[0]
        if len(cols):
            value_x = max(value_x, vx + cols.max() + 1)
    print(f'\n// measured off {os.path.basename(SRC)} — {W}x{H}')
    print(f'const SRC_W = {W}, SRC_H = {H};')
    print(f'const VALUE_X = {value_x};   // right edge of his own values')
    print('const ROW_Y = [' + ', '.join(str(r[1]) for r in rows) + '];'
          '   // baselines: caps sit on the band bottom')
    caps = round(sum(b - t for t, b, _, _ in rows) / len(rows))
    print(f'// cap height {caps}px  ->  font-size about {round(caps / 0.72)}px')
    print('rows (band, label ends, value starts):')
    for i, (top, bot, le, vx) in enumerate(rows):
        print(f'  {i + 1}. y {top}-{bot}   label ends x{le}   value from x{vx}')


if __name__ == '__main__':
    main()
