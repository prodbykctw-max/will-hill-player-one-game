#!/usr/bin/env python3
"""
Redraw the Edgewood hours board so it reads. Same words, legible glyphs.

WHY. Under SOUL FOOD & SPIRITS the day plate carries a HOURS header and three
day rows that render as noise — the generator produced letter-shaped mush at
roughly 6px a line and it was never legible, not even in the source sheet
(assets/refs/stages-day-sheet.webp is the same resolution; checked).

The client's ruling is narrow and this tool stays inside it: *"if you wanna
make them legible, then we could do that... but we're not trying to change
anything text wise."* Legibility only.

⚠️ THE WORDS BELOW ARE A READING OF ILLEGIBLE PIXELS, NOT A TRANSCRIPT, and
that distinction is the whole risk in this file. The mush reads as MDO-TNU /
FOI-SAT / F9GN with trailing 4-12 / 4-2 / 4-10; only "4-10" on the last row is
unambiguous. HOURS is inferred from a 5-glyph header boxed between two rules
on a bar's sign. If any of it is wrong, this has changed his text — which he
has forbidden twice — so the reading is stated here in one place, in plain
sight, and gets shown to him rendered before anything ships.
HOURS_TEXT = the single place to correct it.

⚠️ AND IT PATCHES EVERY CARRIER. The board is inside `edgewood-day-base` AND
inside the `edgewood-day-bay_mid2` card, which covers it opaquely — patching
only the base would leave the card to paint the mush straight back on top, the
exact failure the title plate's skyline card already cost this project an hour
over. `--audit` lists every plate-shaped file whose copy of the board is still
the old one.

Re-runnable: the clone that clears the old text comes from board rows BELOW it,
which this never writes to.

Usage:
    python3 tools/fix_edgewood_hours.py --preview
    python3 tools/fix_edgewood_hours.py
    python3 tools/fix_edgewood_hours.py --audit
"""

import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BG = os.path.join(ROOT, 'src', 'assets', 'backgrounds')

# The board face, measured off the plate: bright ink clusters at rows 289-294,
# 298-302, 306-311, 315-321 across x 429..497.
X0, Y0, X1, Y1 = 429, 286, 497, 323
CLEAR_FROM = 12            # rows below Y1 to clone clean board face from

# Sampled from the plate, not invented: ink is the warm white the rows are
# already drawn in, rule is the amber bar either side of the header.
INK = (159, 151, 134)
RULE = (115, 101, 69)

# ⚠️ THE READING. See the warning above. One place, plain sight.
HOURS_TEXT = [
    ('HOURS', None),           # header, centred between two rules
    ('MON-THU', '4-12'),
    ('FRI-SAT', '4-2'),
    ('SUN', '4-10'),
]
ROW_Y = [289, 298, 306, 315]

TARGETS = [
    ('edgewood-day-base.webp', dict(quality=94, method=6)),
    ('edgewood-day-bay_mid2.webp', dict(quality=94, method=6)),
]

# ⚠️ A 4x5 FONT, NOT 3x5, AND M IS THE REASON. At three pixels wide M and N
# are the same shape — the first pass rendered "MON" as "MOM", which on a sign
# whose whole point is legibility is worse than the mush it replaced. Four
# wide buys the diagonal, and it still fits: "MON-THU" plus "4-12" is 53px of
# a 64px inner board.
F = {
    'A': ['0110', '1001', '1111', '1001', '1001'],
    'D': ['1110', '1001', '1001', '1001', '1110'],
    'E': ['1111', '1000', '1110', '1000', '1111'],
    'F': ['1111', '1000', '1110', '1000', '1000'],
    'H': ['1001', '1001', '1111', '1001', '1001'],
    'I': ['1110', '0100', '0100', '0100', '1110'],
    'M': ['1001', '1111', '1111', '1001', '1001'],
    'N': ['1001', '1101', '1011', '1001', '1001'],
    'O': ['0110', '1001', '1001', '1001', '0110'],
    'R': ['1110', '1001', '1110', '1010', '1001'],
    'S': ['0111', '1000', '0110', '0001', '1110'],
    'T': ['1111', '0100', '0100', '0100', '0100'],
    'U': ['1001', '1001', '1001', '1001', '0110'],
    'W': ['1001', '1001', '1111', '1111', '1001'],
    '0': ['0110', '1001', '1001', '1001', '0110'],
    '1': ['0010', '0110', '0010', '0010', '0111'],
    '2': ['1110', '0001', '0110', '1000', '1111'],
    '3': ['1110', '0001', '0110', '0001', '1110'],
    '4': ['1001', '1001', '1111', '0001', '0001'],
    '5': ['1111', '1000', '1110', '0001', '1110'],
    '6': ['0110', '1000', '1110', '1001', '0110'],
    '7': ['1111', '0001', '0010', '0100', '0100'],
    '8': ['0110', '1001', '0110', '1001', '0110'],
    '9': ['0110', '1001', '0111', '0001', '0110'],
    '-': ['0000', '0000', '1111', '0000', '0000'],
    ' ': ['0000', '0000', '0000', '0000', '0000'],
}
GLYPH_W, GLYPH_H, TRACK = 4, 5, 1


def text_w(s):
    return len(s) * (GLYPH_W + TRACK) - TRACK if s else 0


def blit(a, s, x, y, rgb):
    for i, ch in enumerate(s.upper()):
        g = F.get(ch)
        if g is None:
            continue
        gx = x + i * (GLYPH_W + TRACK)
        for r in range(GLYPH_H):
            for c in range(GLYPH_W):
                if g[r][c] == '1':
                    a[y + r, gx + c] = rgb


def board_contrast(a):
    b = a[Y0:Y1, X0:X1].astype(np.int32)
    return float(np.percentile(b, 99) - np.percentile(b, 1))


def redraw(a):
    # 1. clear the old mush by cloning board face from below it, mirrored.
    h = Y1 - Y0
    src = a[Y1 + CLEAR_FROM:Y1 + CLEAR_FROM + h, X0:X1]
    if src.shape[0] < h:                       # ran off the plate: use the last row
        src = np.repeat(a[Y1 + CLEAR_FROM - 1:Y1 + CLEAR_FROM, X0:X1], h, axis=0)
    a[Y0:Y1, X0:X1] = src[::-1]

    # 2. the header: a rule either side of the word, the way it is painted.
    w = X1 - X0
    hy = ROW_Y[0]
    hw = text_w(HOURS_TEXT[0][0])
    hx = X0 + (w - hw) // 2
    blit(a, HOURS_TEXT[0][0], hx, hy, INK)
    a[hy + 2, X0 + 1:hx - 2] = RULE
    a[hy + 2, hx + hw + 2:X1 - 1] = RULE

    # 3. three rows: the day range left, the time range right.
    for (label, times), y in zip(HOURS_TEXT[1:], ROW_Y[1:]):
        blit(a, label, X0 + 2, y, INK)
        blit(a, times, X1 - 2 - text_w(times), y, INK)
    return a


def audit():
    print(f'board x {X0}..{X1} y {Y0}..{Y1}')
    ref = (762, 470)
    for name in sorted(os.listdir(BG)):
        if not name.endswith('.webp') or 'edgewood' not in name:
            continue
        path = os.path.join(BG, name)
        im = Image.open(path)
        if im.size != ref:
            continue
        a = np.asarray(im.convert('RGBA'))
        cov = (a[Y0:Y1, X0:X1, 3] > 8).mean()
        if cov < 0.5:
            continue
        # edgewood-day.webp is the UNCUT archive — nothing imports it, the
        # cards are cut from it, and it keeps the original board on purpose.
        tag = 'ARCHIVE' if name == 'edgewood-day.webp' else 'live   '
        print(f'  {tag} {name:34s} coverage {cov:.2f}  board contrast '
              f'{board_contrast(np.asarray(im.convert("RGB"))):.0f}')


def main():
    if '--audit' in sys.argv:
        audit()
        return
    preview = '--preview' in sys.argv
    print('Edgewood hours board — ' + ' / '.join(
        t[0] + (' ' + t[1] if t[1] else '') for t in HOURS_TEXT))
    for name, save in TARGETS:
        path = os.path.join(BG, name)
        im = Image.open(path)
        alpha = im.getchannel('A') if im.mode in ('RGBA', 'LA') else None
        a = np.array(im.convert('RGB'))
        before = board_contrast(a)
        a = redraw(a)
        if preview:
            Image.fromarray(a[Y0 - 6:Y1 + 6, X0 - 6:X1 + 6]).resize(
                ((X1 - X0 + 12) * 7, (Y1 - Y0 + 12) * 7), Image.NEAREST
            ).save(os.path.join(ROOT, 'shots', f'hours-new-{name}.png'))
            print(f'  {name}  preview only -> shots/hours-new-{name}.png')
            continue
        out = Image.fromarray(a)
        if alpha is not None:
            out = out.convert('RGBA')
            out.putalpha(alpha)
        out.save(path, 'WEBP', **save)
        print(f'  {name}  board contrast {before:.0f} -> '
              f'{board_contrast(np.array(Image.open(path).convert("RGB"))):.0f}')


if __name__ == '__main__':
    main()
