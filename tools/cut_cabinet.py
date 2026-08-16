#!/usr/bin/env python3
"""
Cut the client's MARTA cabinet concepts into layered plates, so HIS ARTWORK is
the screen and the painted controls are the actual controls.

⚠️ READ THIS BEFORE CHANGING ANYTHING HERE.

An earlier pass kept only the metal housing and re-drew the heading, buttons,
switches and select in CSS. The client rejected it outright: "I never asked you
to layer any of your art style on top of this shit… I want the artwork that
I've just generated in ChatGPT to be the actual option setting and dashboard."
And, spelling out the build he wanted: "taking a larger cabinet and using it
for both and then layering the ChatGPT artwork and just making those active
buttons, making everything active."

So nothing in this file draws. It crops, and it blanks. Every visible pixel of
the finished screen is his.

The mechanism is the one his MARTA breeze card already uses (#lbCard in
index.html): artwork as a background at its own aspect ratio,
`container-type: inline-size`, and everything over it positioned at measured
FRACTIONS. Proven on his art and on his phone.

WHICH HOUSING, AND WHY IT IS NOT A PREFERENCE
---------------------------------------------
He asked for one cabinet used for both. The two concepts are different
paintings — masking out both panels and diffing the housings gives a mean
absolute difference of 48.6/765 — so one has to go, and the choice is decided
by arithmetic, not taste:

    options panel  546x1002 -> into the settings opening at width 501: 919 tall,
                               fits the 1147 available.
    settings panel 501x1147 -> into the options opening at width 546: 1250 tall,
                               does NOT fit the 1002 available.

Only the settings housing holds both. That is the one kept.

WHAT CANNOT COME FROM A PAINTING
--------------------------------
Four spots on the settings panel change with state: the three switches and the
TIME OF DAY value. A fixed image cannot show a switch that is off. Those four
are blanked here and filled at runtime with separate pieces the client draws
himself — he was clear he would rather draw them than have them composited:
"I CAN LITERALLY EDIT THE IMAGE TO EXACTLY AS NEEDED."

    pill-on / pill-off      120x51
    tod-atlanta / tod-day / tod-night / tod-local    219x57

Until those arrive the blanked spots read as empty sockets, which is the
honest placeholder — see PIECES below and the matching rects in index.html.

MEASURING, AND THE THREE WAYS IT GOES WRONG
-------------------------------------------
Every rect below was found by amber-run detection (`r - b > 45`) or by
ink-over-fill inside the panel (`luma > 26` against a flat rgb(8,9,13)), and
then verified by drawing the box back onto the image and looking at it.

Do not reach for the obvious alternatives. Luminance thresholding finds the
whole cabinet, because the housing is dark metal and the screen is dark glass.
Local flatness finds whichever card is emptiest — on dashboard.png it picks
CITIES. And the panel border is amber-on-near-black at low contrast, so a
naive edge pass finds the button outlines but not the panel around them.

Usage:
    python3 tools/cut_cabinet.py
"""
import os

from PIL import Image, ImageDraw

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(REPO_ROOT, 'assets', 'ui-concept')
OUT = os.path.join(REPO_ROOT, 'src', 'assets', 'ui')

# The painted panel in each concept, measured. (x0, y0, x1, y1), inclusive.
PANEL = {
    'options': (110, 207, 655, 1208),    # 546 x 1002
    'settings': (143, 236, 643, 1382),   # 501 x 1147
}
# The concept whose housing is kept — see the note above; this is arithmetic,
# not preference.
HOUSING = 'settings'

# The glass immediately outside the panel border, median-sampled on all four
# sides: (10,10,13) left, (9,8,10) right, (9,9,11) below. This is what the
# blanked panel rect is filled with, so the housing reads as an empty screen
# rather than a dark rectangle pasted onto one.
GLASS = (9, 9, 11)
# The panel's own interior, median-sampled from the flat 95% of it. Used for
# the four state sockets.
PANEL_FILL = (10, 10, 13)
# The painted panels have rounded corners; cropping square would leave four
# bright metal nicks at the corners of the plate.
RADIUS = 20

# ── THE FOUR SOCKETS ─────────────────────────────────────────────────────
# Image coordinates in settings.png. Blanked out of the settings plate and
# filled at runtime by the client's own pieces. Sizes here ARE the sizes he
# was given to draw to, so changing one means re-briefing him.
SOCKETS = [
    ('sound', 493, 493, 612, 543),      # MUSIC          120 x 51
    ('sfx', 493, 593, 612, 642),        # SOUND EFFECTS  120 x 50
    ('haptics', 493, 691, 612, 741),    # VIBRATION      120 x 51
    ('tod', 394, 819, 612, 875),        # TIME OF DAY    219 x 57
]


def rounded_alpha(size, radius):
    """A rounded-rectangle alpha mask the size of a cropped panel."""
    mask = Image.new('L', size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=255)
    return mask


def save(im, name):
    path = os.path.join(OUT, name)
    # q90 with alpha. These are photo-rendered metal and soft amber glow, not
    # flat pixel art, so lossless costs several times the bytes for nothing.
    im.save(path, 'WEBP', quality=90, method=6)
    return path, os.path.getsize(path) / 1024


def main():
    os.makedirs(OUT, exist_ok=True)
    report = []

    # ── 1. the housing, with its painted panel blanked back to glass ──────
    house = Image.open(os.path.join(SRC, f'{HOUSING}.png')).convert('RGB')
    hx0, hy0, hx1, hy1 = PANEL[HOUSING]
    ImageDraw.Draw(house).rectangle([hx0, hy0, hx1, hy1], fill=GLASS)
    report.append(save(house, 'cabinet.webp') + (f'{house.width}x{house.height}',))

    # ── 2. each painted panel, cropped to its own rect ────────────────────
    for which in ('options', 'settings'):
        src = Image.open(os.path.join(SRC, f'{which}.png')).convert('RGBA')
        x0, y0, x1, y1 = PANEL[which]
        plate = src.crop((x0, y0, x1 + 1, y1 + 1))

        if which == 'settings':
            d = ImageDraw.Draw(plate)
            for _name, sx0, sy0, sx1, sy1 in SOCKETS:
                d.rectangle([sx0 - x0, sy0 - y0, sx1 - x0, sy1 - y0],
                            fill=PANEL_FILL + (255,))

        plate.putalpha(rounded_alpha(plate.size, RADIUS))
        report.append(save(plate, f'panel-{which}.webp')
                      + (f'{plate.width}x{plate.height}',))

    for path, kb, dims in report:
        print(f'{os.path.basename(path):24s} {dims:>10s}  {kb:6.1f} KB')

    # ── the numbers index.html needs ──────────────────────────────────────
    W, H = house.width, house.height
    pw, ph = hx1 - hx0 + 1, hy1 - hy0 + 1
    print(f'\nhousing {W}x{H}, aspect {W}/{H}')
    print('opening, as fractions of the housing:')
    print(f'  left {hx0 / W:.5f}  top {hy0 / H:.5f}  width {pw / W:.5f}')
    for which in ('options', 'settings'):
        x0, y0, x1, y1 = PANEL[which]
        print(f'  plate {which:9s} aspect {x1 - x0 + 1}/{y1 - y0 + 1}')

    # Hit targets and sockets, as fractions of their own plate.
    print('\nOPTIONS hit targets, as fractions of panel-options:')
    ox0, oy0, ox1, oy1 = PANEL['options']
    ow, oh = ox1 - ox0 + 1, oy1 - oy0 + 1
    for label, bx0, by0, bx1, by1 in [
        ('btnMenuBoard', 146, 418, 619, 565),
        ('btnMenuHow', 146, 613, 619, 758),
        ('btnMenuSettings', 146, 806, 619, 949),
        ('btnMenuClose', 146, 997, 619, 1138),
        ('panelClose', 592, 240, 655, 339),
    ]:
        print(f'  {label:16s} left {(bx0 - ox0) / ow:.4f} top {(by0 - oy0) / oh:.4f} '
              f'w {(bx1 - bx0 + 1) / ow:.4f} h {(by1 - by0 + 1) / oh:.4f}')

    print('\nSETTINGS sockets and hit targets, as fractions of panel-settings:')
    sw, sh = hx1 - hx0 + 1, hy1 - hy0 + 1
    for name, sx0, sy0, sx1, sy1 in SOCKETS:
        print(f'  {name:16s} left {(sx0 - hx0) / sw:.4f} top {(sy0 - hy0) / sh:.4f} '
              f'w {(sx1 - sx0 + 1) / sw:.4f} h {(sy1 - sy0 + 1) / sh:.4f}')
    for label, bx0, by0, bx1, by1 in [('btnBack', 174, 958, 613, 1022)]:
        print(f'  {label:16s} left {(bx0 - hx0) / sw:.4f} top {(by0 - hy0) / sh:.4f} '
              f'w {(bx1 - bx0 + 1) / sw:.4f} h {(by1 - by0 + 1) / sh:.4f}')


if __name__ == '__main__':
    main()
