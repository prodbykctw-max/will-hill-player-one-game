#!/usr/bin/env python3
"""
Cut the MARTA cabinet housing out of the client's OPTIONS concept so the game
can draw live controls inside it.

WHY ONE HOUSING AND NOT TWO. He commissioned an OPTIONS panel and a SETTINGS
panel separately, and the two cabinets are NOT the same painting — masking out
both panels and diffing the housings gives a mean absolute difference of
48.6/765, with 48% of housing pixels off by more than 30. The MARTA wordmark,
the joystick and the ALERT lamps all sit at different heights. Shipping both
would make the whole cabinet jump on OPTIONS -> SETTINGS, which reads as a
broken transition. So one plate carries both, and the panel content is the
only thing that changes. It also halves the asset weight, which matters at
1.7MB a piece on a phone.

WHY THE INTERIOR IS FILLED, NOT MADE TRANSPARENT. The panel is drawn ON the
screen glass. Punching a hole would show the dimmed game through the cabinet,
which is not what the concept depicts. The interior measures a flat
rgb(8,9,13) — luminance 8.3 to 9.9 across every horizontal band, 95% of the
inner area — so painting it back over the text and buttons is invisible.

WHY THE BORDER IS LEFT ALONE. The amber rounded border and its inward glow are
part of the painting. Redrawing them in CSS would lose the glow and the corner
radius would never quite match, so the fill stops short of them: INSET pixels
inside the measured rect, which is enough to erase the OPTIONS heading and the
four buttons and not enough to touch the frame.

The rect itself was measured by finding the longest amber runs
(`r - b > 45`) and then drawing the box back onto the image and looking at it.
Luminance and local-flatness both fail here and the notes in
assets/ui-concept/README.md say why.

Usage:
    python3 tools/cut_cabinet.py
"""
import os

from PIL import Image, ImageDraw

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(REPO_ROOT, 'assets', 'ui-concept', 'options.png')
OUT = os.path.join(REPO_ROOT, 'src', 'assets', 'ui', 'cabinet.webp')

# The amber panel rect in options.png, measured then eyeballed. See the
# README next to the source art.
PANEL = (110, 207, 655, 1208)
# How far inside the border the fill stops. 7px clears the heading and the
# button strokes while leaving the frame and its glow untouched.
INSET = 7
# The interior's own colour, median-sampled from the flat 95% of it.
FILL = (8, 9, 13)
# The corner radius of the painted panel, so the fill does not square off the
# rounded corners the artwork has.
RADIUS = 18


def main():
    im = Image.open(SRC).convert('RGB')
    x0, y0, x1, y1 = PANEL
    d = ImageDraw.Draw(im)
    d.rounded_rectangle(
        [x0 + INSET, y0 + INSET, x1 - INSET, y1 - INSET],
        radius=RADIUS, fill=FILL,
    )

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    # q88 — this is a photo-rendered metal housing with fine specular detail,
    # not flat pixel art, so lossless buys nothing and costs several times the
    # bytes. The one region that must not band is the flat interior fill, and
    # a flat fill is exactly what WebP encodes best.
    im.save(OUT, 'WEBP', quality=88, method=6)

    src_kb = os.path.getsize(SRC) / 1024
    out_kb = os.path.getsize(OUT) / 1024
    print(f'{im.width}x{im.height}  {src_kb:.0f}KB PNG -> {out_kb:.0f}KB WebP')
    print('screen opening, as fractions of the plate:')
    print(f'  left   {x0 / im.width:.4f}')
    print(f'  top    {y0 / im.height:.4f}')
    print(f'  width  {(x1 - x0 + 1) / im.width:.4f}')
    print(f'  height {(y1 - y0 + 1) / im.height:.4f}')
    print(f'  plate aspect (w/h) {im.width / im.height:.4f}')


if __name__ == '__main__':
    main()
