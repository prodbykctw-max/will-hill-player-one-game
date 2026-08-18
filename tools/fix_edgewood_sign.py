#!/usr/bin/env python3
"""
Make the Edgewood storefront sign the real one: OUR BAR ATL, its address, and
its actual hours.

WHY. The generator painted "SOUL FOOD & SPIRITS" onto the door and an hours
list that rendered as noise. The client photographed the real storefront: the
decal is OUR BAR ATL / 339 EDGEWOOD AVE SE with a real hours list. He asked for
"that whole sign as realistic as possible, including the name."

⚠️ THIS IS THE ONE PLACE PAINTED TEXT GETS EDITED, AND ONLY BECAUSE HE ASKED.
His standing rule is that the art's words are real and are not to be touched —
"these pictures are real", "don't change any of the text in the picture". The
exception he granted here is narrow and specific: the painted words are the
thing that is NOT real, so making them real is the instruction. Do not read
this file as licence to edit lettering anywhere else.

⚠️ AND A PREVIOUS VERSION OF THIS TOOL INVENTED THE HOURS. It redrew them
legibly from a reading of illegible pixels and shipped nothing, because the
deploy was held for confirmation and the client caught it. The hours below are
SOURCED, not read:

    https://www.ourbaratl.com/hours-location   checked 2026-08-18
      Monday    closed
      Tue-Wed   8PM - 2:30AM
      Thu-Sat   2PM - 2:30AM
      Sunday    2PM - 12AM

    Google and Yelp disagree (they say Mon-Sat 2PM-3AM, Sun 2PM-12AM). The
    operator's own site wins. If you are about to "correct" this back to the
    Google hours: don't, unless the site itself has changed.

The real decal lists all seven days. Seven rows at this face need 42px against
37px of board and do not fit, so the days are GROUPED — which is how the
operator's own site presents them, so nothing is invented by the grouping.

⚠️ SIX FILES, NOT ONE. The sign is its own parallax card, so the text exists in
the base, in the bay it sits in, AND in the card — day and night. Measured
coverage of the sign band:

    edgewood[-day]-base       1.00 / 1.00
    edgewood[-day]-bay_mid2   0.74 / 0.92
    edgewood[-day]-sign_soul  0.38 / 0.10

Patch one and a card repaints the old name straight over the new one at its own
depth. That is exactly what the title plate's skyline card cost an hour of.
`--audit` lists every plate-shaped Edgewood file and whether its copy is done.

⚠️ THE FILENAME `sign_soul` STAYS. It is a card key wired into the planes json
and the stage spec; renaming it is a refactor with no visual payoff. The name
is historical — the sign reads OUR BAR ATL now.

Day and night are measured SEPARATELY and do not share geometry. Night's board
is 30px where day's is 37, and night's has no room for the address line.

Re-runnable: each band is blanked to its own sampled surface (see `clear`),
never cloned from neighbouring rows, so running it twice lands the same pixels
and running it on an already-patched plate is a no-op you cannot see.

Usage:
    python3 tools/fix_edgewood_sign.py --preview
    python3 tools/fix_edgewood_sign.py
    python3 tools/fix_edgewood_sign.py --audit
"""

import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BG = os.path.join(ROOT, 'src', 'assets', 'backgrounds')

# ── THE WORDS ────────────────────────────────────────────────────────────
NAME = ['OUR BAR', 'ATL']          # stacked, as the neon in this same plate is
# One line, 75px at 3x5 against 83px of panel. It only fits because the panel
# turned out to be 85px wide rather than the 68 first measured — see the note
# on x0/x1 below. At 68 this had to wrap.
ADDRESS = ['339 EDGEWOOD AVE SE']
HOURS = [('MON', 'CLOSED'),
         ('TUE-WED', '8-2:30'),
         ('THU-SAT', '2-2:30'),
         ('SUN', '2-12')]

# ── THE FACES ────────────────────────────────────────────────────────────
# The name is the big gold lettering: 6x7, to sit at the weight the painted
# "SOUL FOOD" had (7-8px tall).
NAME_F = {
    'O': ['011110', '110011', '110011', '110011', '110011', '110011', '011110'],
    'U': ['110011', '110011', '110011', '110011', '110011', '110011', '011110'],
    'R': ['111110', '110011', '110011', '111110', '111000', '110110', '110011'],
    'B': ['111110', '110011', '110011', '111110', '110011', '110011', '111110'],
    'A': ['001100', '011110', '110011', '110011', '111111', '110011', '110011'],
    'T': ['111111', '001100', '001100', '001100', '001100', '001100', '001100'],
    'L': ['110000', '110000', '110000', '110000', '110000', '110000', '111111'],
    ' ': ['000000'] * 7,
}
NAME_W, NAME_H, NAME_TRACK = 6, 7, 2

# The body face. 4 wide, not 3, and M is the reason: at three pixels M and N
# are the same shape and the first pass rendered "MON" as "MOM".
BODY_F = {
    'A': ['0110', '1001', '1111', '1001', '1001'],
    'C': ['0111', '1000', '1000', '1000', '0111'],
    'D': ['1110', '1001', '1001', '1001', '1110'],
    'E': ['1111', '1000', '1110', '1000', '1111'],
    'F': ['1111', '1000', '1110', '1000', '1000'],
    'H': ['1001', '1001', '1111', '1001', '1001'],
    'I': ['1110', '0100', '0100', '0100', '1110'],
    'L': ['1000', '1000', '1000', '1000', '1111'],
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
    '5': ['1111', '1000', '1110', '0001', '1110'],
    '8': ['0110', '1001', '0110', '1001', '0110'],
    '9': ['0110', '1001', '0111', '0001', '0110'],
    ':': ['0000', '0100', '0000', '0100', '0000'],
    '-': ['0000', '0000', '1111', '0000', '0000'],
    ' ': ['0000'] * 5,
}
BODY_W, BODY_H, BODY_TRACK = 4, 5, 1

# The address only. 3 wide, which is normally unusable — see the M/N note
# above — and safe HERE because the address contains neither letter. Asserted
# at run time rather than trusted.
ADDR_F = {
    'A': ['010', '101', '111', '101', '101'],
    'D': ['110', '101', '101', '101', '110'],
    'E': ['111', '100', '110', '100', '111'],
    'G': ['011', '100', '101', '101', '011'],
    'O': ['010', '101', '101', '101', '010'],
    'S': ['011', '100', '010', '001', '110'],
    'V': ['101', '101', '101', '101', '010'],
    'W': ['101', '101', '111', '111', '101'],
    '3': ['111', '001', '011', '001', '111'],
    '9': ['111', '101', '111', '001', '111'],
    ' ': ['000'] * 5,
}
ADDR_W, ADDR_H, ADDR_TRACK = 3, 5, 1

# ── THE TWO PLATES, MEASURED SEPARATELY ─────────────────────────────────
# `name_y` are the top rows of the two painted name lines; `board` is the dark
# decal panel under them; `rows` are where the hour lines go inside it.
PLATES = {
    # ⚠️ x411..496, AND THAT NUMBER WAS WRONG TWICE. Keying on "gold" or on
    # "bright" finds the warm wooden door frame either side and reports a
    # panel that is too narrow AND offset. The measurement that works is the
    # longest DARK run on a row of the panel with no lettering on it —
    # y260 for the day plate, y280 for night — and both give x411..496.
    #
    # The 68px version centred the name 10px right of true and painted 1px of
    # fill onto the frame, both visible in the first in-game frame.
    'day': dict(
        size=(762, 470), x0=411, x1=496,
        name_y=(262, 274), name_clear=(256, 285),
        board=(286, 323), addr_y=(288,), rows=(296, 303, 310, 317),
        gold=(194, 178, 138), ink=(153, 151, 144),
        # ⚠️ FOUR CARRIERS IN THE DAY, NOT THREE. The pavement card's top edge
        # laps the bottom six rows of the decal, y317..322 — which is exactly
        # where the SUN row lands. `--audit` caught it as MISSED after the
        # first write; without it the last line of the hours would have been
        # the only one still showing the old mush.
        files=[('edgewood-day-base.webp', dict(quality=94, method=6)),
               ('edgewood-day-bay_mid2.webp', dict(quality=94, method=6)),
               ('edgewood-day-sign_soul.webp', dict(quality=94, method=6)),
               ('edgewood-day-pavement.webp', dict(quality=94, method=6))],
    ),
    'night': dict(
        size=(764, 454), x0=411, x1=496,
        name_y=(230, 242), name_clear=(224, 252),
        # Night's board is 36px against day's 37, so it carries the address
        # too, at a tighter 6px pitch.
        board=(252, 288), addr_y=(254,), rows=(262, 268, 274, 280),
        gold=(151, 122, 102), ink=(140, 117, 100),
        files=[('edgewood-base.webp', dict(quality=94, method=6)),
               ('edgewood-bay_mid2.webp', dict(quality=94, method=6)),
               ('edgewood-sign_soul.webp', dict(quality=94, method=6))],
    ),
}

CLEAR_DROP = 12          # rows below a band to clone clean surface from


def text_w(s, w, track):
    return len(s) * (w + track) - track if s else 0


def blit(a, s, x, y, rgb, font, gw, gh, track):
    for i, ch in enumerate(s.upper()):
        g = font.get(ch)
        if g is None:
            raise KeyError(f'no glyph for {ch!r} in this face')
        gx = x + i * (gw + track)
        for r in range(gh):
            for c in range(gw):
                if g[r][c] == '1':
                    a[y + r, gx + c] = rgb


def clear(a, x0, x1, y0, y1, seed):
    """Blank a band back to the panel's own dark surface.

    ⚠️ NOT A CLONE. The first version copied clean rows from below the band,
    which is right for cobblestone and wrong here: every candidate source row
    inside this sign already has lettering on it, so the clear dragged the old
    hours up under the new name — visible in the first preview as FRI-SAT and
    MON-THU ghosting through OUR BAR ATL.

    The decal is a flat printed panel on glass, so its own background IS flat.
    Sampling the darkest half of the band and filling with that, plus the
    band's own faint grain, is both safer and closer to what the surface
    actually is. Deterministic seed so a re-run produces the same pixels.
    """
    band = a[y0:y1, x0:x1]
    lum = band.mean(axis=2)
    dark = band[lum <= np.percentile(lum, 50)]
    base = np.median(dark, axis=0) if len(dark) else np.array([12, 11, 7])
    grain = float(np.std(dark)) if len(dark) else 2.0
    rng = np.random.default_rng(seed)
    noise = rng.normal(0.0, min(grain, 3.0), size=band.shape[:2])[..., None]
    a[y0:y1, x0:x1] = np.clip(base[None, None, :] + noise, 0, 255).astype(np.uint8)


def band_contrast(a, x0, x1, y0, y1):
    b = a[y0:y1, x0:x1].astype(np.int32)
    return float(np.percentile(b, 99) - np.percentile(b, 1))


def redraw(a, p):
    x0, x1 = p['x0'], p['x1']
    w = x1 - x0
    # 1px inset each side, not 2. The longest row is 63px and the board is 68
    # wide; at a 2px inset the label and the times touched (TUE-WEDS-2:30 in
    # the first preview). One pixel of margin buys three of column gap.
    inset = 1
    inner = w - inset * 2

    # ── the name ─────────────────────────────────────────────────────────
    clear(a, x0, x1, p['name_clear'][0], p['name_clear'][1], seed=11)
    for line, y in zip(NAME, p['name_y']):
        lw = text_w(line, NAME_W, NAME_TRACK)
        if lw > w:
            sys.exit(f'name line {line!r} is {lw}px against {w}px of sign')
        blit(a, line, x0 + (w - lw) // 2, y, p['gold'],
             NAME_F, NAME_W, NAME_H, NAME_TRACK)

    # ── the decal panel ──────────────────────────────────────────────────
    by0, by1 = p['board']
    clear(a, x0, x1, by0, by1, seed=22)

    if p['addr_y'] is not None:
        for line, y in zip(ADDRESS, p['addr_y']):
            aw = text_w(line, ADDR_W, ADDR_TRACK)
            if aw > inner:
                sys.exit(f'address line {line!r} is {aw}px against {inner}px')
            blit(a, line, x0 + (w - aw) // 2, y, p['ink'],
                 ADDR_F, ADDR_W, ADDR_H, ADDR_TRACK)

    for (label, times), y in zip(HOURS, p['rows']):
        lw = text_w(label, BODY_W, BODY_TRACK)
        tw = text_w(times, BODY_W, BODY_TRACK)
        # ⚠️ FAIL LOUDLY RATHER THAN OVERFLOW. The label starts 2px in and the
        # times end 2px in, so the two columns share `inner` and must leave at
        # least a pixel between them. The longest pair — TUE-WED / 8-2:30 — is
        # 63px against 64, so there is exactly one. Any edit to the words has
        # to be told about it here, not discovered on a phone.
        if lw + tw >= inner:
            sys.exit(f'row {label} {times} is {lw + tw}px against {inner}px '
                     f'— no gap left between the columns')
        blit(a, label, x0 + inset, y, p['ink'], BODY_F, BODY_W, BODY_H, BODY_TRACK)
        blit(a, times, x1 - inset - tw, y, p['ink'], BODY_F, BODY_W, BODY_H, BODY_TRACK)
    return a


def audit():
    for tod, p in PLATES.items():
        print(f'{tod}: sign x {p["x0"]}..{p["x1"]}  name {p["name_clear"]}  '
              f'board {p["board"]}')
        for name in sorted(os.listdir(BG)):
            if not name.endswith('.webp') or 'edgewood' not in name:
                continue
            if ('day' in name) != (tod == 'day'):
                continue
            path = os.path.join(BG, name)
            im = Image.open(path)
            if im.size != p['size']:
                continue
            # ⚠️ BOTH BANDS. Measuring only the board missed the sign_soul
            # card entirely — it carries 57% of the NAME band and none of the
            # board, so an audit that looked at one of the two reported the
            # card that the whole "six files, not one" warning is about as
            # absent.
            rgba = np.asarray(im.convert('RGBA'))
            cov = max(
                (rgba[p['board'][0]:p['board'][1], p['x0']:p['x1'], 3] > 8).mean(),
                (rgba[p['name_clear'][0]:p['name_clear'][1], p['x0']:p['x1'], 3] > 8).mean(),
            )
            if cov < 0.05:
                continue
            done = name in [f for f, _ in p['files']]
            arch = name in ('edgewood-day.webp', 'edgewood.webp')
            tag = 'ARCHIVE' if arch else ('patched' if done else '⚠️ MISSED')
            c = band_contrast(np.asarray(im.convert('RGB')),
                              p['x0'], p['x1'], *p['board'])
            print(f'   {tag:9s} {name:34s} cov {cov:.2f}  board contrast {c:.0f}')


def main():
    if '--audit' in sys.argv:
        audit()
        return
    bad = [c for c in ''.join(ADDRESS) if c in 'MN']
    if bad:
        sys.exit(f'address contains {bad} — the 3x5 face cannot tell M from N')
    preview = '--preview' in sys.argv
    print(' '.join(NAME) + ' / ' + ' '.join(ADDRESS))
    for label, times in HOURS:
        print(f'   {label:9s} {times}')
    for tod, p in PLATES.items():
        for name, save in p['files']:
            path = os.path.join(BG, name)
            im = Image.open(path)
            alpha = im.getchannel('A') if im.mode in ('RGBA', 'LA') else None
            a = np.array(im.convert('RGB'))
            a = redraw(a, p)
            if preview:
                y0 = p['name_clear'][0] - 6
                y1 = p['board'][1] + 6
                Image.fromarray(a[y0:y1, p['x0'] - 6:p['x1'] + 6]).resize(
                    ((p['x1'] - p['x0'] + 12) * 8, (y1 - y0) * 8), Image.NEAREST
                ).save(os.path.join(ROOT, 'shots', f'sign-{name}.png'))
                print(f'  {name}  -> shots/sign-{name}.png')
                continue
            out = Image.fromarray(a)
            if alpha is not None:
                out = out.convert('RGBA')
                out.putalpha(alpha)
            out.save(path, 'WEBP', **save)
            print(f'  {name}  written ({tod})')


if __name__ == '__main__':
    main()
