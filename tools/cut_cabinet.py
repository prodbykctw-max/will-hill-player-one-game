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

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

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
# ⚠️ MEASURED ON settings-empty.png, WHICH IS ITS OWN PAINTING.
# The client redrew the panel when he emptied it, so these are NOT the rects
# of the original settings.png — the pill went 120x51 -> 114x53 and every row
# moved. Re-measure after any new render rather than trusting these.
SETTINGS_PANEL = (143, 235, 641, 1382)      # 499 x 1148
SOCKETS = [
    ('sound', 493, 482, 606, 534),      # MUSIC          114 x 53
    ('sfx', 493, 591, 606, 643),        # SOUND EFFECTS  114 x 53
    ('haptics', 493, 700, 606, 753),    # VIBRATION      114 x 54
    ('tod', 391, 810, 609, 872),        # TIME OF DAY    219 x 63
]
PILL_SIZE = (114, 53)

# ── WHERE EACH STATE PIECE IS CUT FROM ───────────────────────────────────
# ⚠️ EVERY ONE OF THESE IS A SEPARATE ChatGPT RENDER AT ITS OWN SCALE, and
# they do not register with each other. The all-off panel is 878x1791 with a
# 509x1155 panel and a 144x55 pill; the empty panel is 852x1846 with a 499x1148
# panel and a 114x53 socket; the value boxes are drawn 537x101 against a socket
# of 219x63. Asking for registered variants of one painting is not something
# the generator can do, so each piece is CROPPED from his art and RESIZED to
# the socket. Resizing his pixels is not drawing over them.
# ── RECONCILING THE SCALES ───────────────────────────────────────────────
# ⚠️ NO TWO OF HIS RENDERS SHARE A SCALE, so nothing can be cut from one and
# dropped into another as-is. Measured:
#
#   settings-empty.png     852x1846 canvas, panel 499x1148, pill socket 114x53
#   settings.png (all on)  852x1846 canvas, panel 501x1147, pill        122x55
#   settings-all-off.png   878x1791 canvas, panel 509x1155, pill        144x55
#
# The all-off panel is not even a uniform scale of the empty one — 499/509 =
# 0.980 across but 1148/1155 = 0.994 down. Cutting a pill from each and
# resizing it to the socket by hand (the first pass here) happens to work for
# a pill, and quietly stops working the moment a piece is not a lozenge.
#
# So every source is ALIGNED first: its panel is located, and the whole image
# is resampled so that panel lands exactly on the reference panel below. After
# that, one set of coordinates — the reference socket rects — cuts correctly
# from any of them, and a new render only needs its panel found.
REFERENCE = 'settings-empty.png'
# Piece -> (source file, rect in REFERENCE coordinates). The rects ARE the
# sockets, so an aligned cut needs no resizing at all.
SRC_PILL_ON = ('settings.png', 'sound')
SRC_PILL_OFF = ('settings-all-off.png', 'sound')
# The four values, top to bottom in his sheet, in the order the <select> lists
# them. All 537x101.
SRC_TOD = ('settings-tod-values.png', 239, 775, [
    ('atl', 315, 415), ('day', 580, 680), ('night', 841, 942),
    ('local', 1104, 1204),
])


def find_panel(im):
    """Locate the amber-bordered panel in one of his cabinet renders.

    Warm-over-dark rather than luminance: the housing is dark metal and the
    screen is dark glass, so a brightness threshold returns the whole cabinet.
    The panel is the largest warm-bordered region on the plate.
    """
    a = np.asarray(im.convert('RGB')).astype(int)
    warm = ((a[..., 0] - a[..., 2]) > 18) & (a[..., 0] > 55)
    filled = ndimage.binary_fill_holes(
        ndimage.binary_closing(warm, np.ones((9, 9))))
    lab, n = ndimage.label(filled)
    if not n:
        raise SystemExit('no panel found')
    sizes = ndimage.sum(filled, lab, range(1, n + 1))
    sl = ndimage.find_objects(lab)[int(np.argmax(sizes))]
    return (sl[1].start, sl[0].start, sl[1].stop - 1, sl[0].stop - 1)


def align(im, ref_panel, ref_size):
    """Resample `im` so its panel lands exactly on `ref_panel`.

    Returns a canvas of `ref_size` in which reference coordinates are valid,
    so one set of socket rects cuts correctly from every render.
    """
    px0, py0, px1, py1 = find_panel(im)
    rx0, ry0, rx1, ry1 = ref_panel
    sx = (rx1 - rx0 + 1) / (px1 - px0 + 1)
    sy = (ry1 - ry0 + 1) / (py1 - py0 + 1)
    out = im.convert('RGBA').resize(
        (max(1, round(im.width * sx)), max(1, round(im.height * sy))),
        Image.LANCZOS)
    canvas = Image.new('RGBA', ref_size, (0, 0, 0, 0))
    canvas.paste(out, (round(rx0 - px0 * sx), round(ry0 - py0 * sy)))
    return canvas, (sx, sy)


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

    # ── 2. the OPTIONS panel, cropped whole. It has no state, so every
    #       pixel of it ships exactly as he painted it. ────────────────────
    ox0, oy0, ox1, oy1 = PANEL['options']
    op = Image.open(os.path.join(SRC, 'options.png')).convert('RGBA')
    op = op.crop((ox0, oy0, ox1 + 1, oy1 + 1))
    # ── HIS ✕ COMES OFF THE OPTIONS PANEL ─────────────────────────────────
    # Client: "remove the x from the options menu."
    #
    # It was painted into the plate, top-right beside OPTIONS — so it could
    # not be removed in CSS. #panelClose was only ever a transparent hit
    # target laid over his paint, and it is gone from the cabinet views too;
    # this menu says BACK TO GAME in his own lettering, and SETTINGS says
    # BACK, so neither view loses its way out.
    #
    # ⚠️ PATCHED WITH HIS OWN PIXELS, NOT A FLAT FILL. The field looks black
    # and is not: it reads (8,9,13) on one side of the ✕ and (7,8,12) on the
    # other, so PANEL_FILL would leave a faintly wrong rectangle exactly where
    # somebody is looking. A patch lifted from the empty field at the same
    # height, 40px to its left, carries the same gradient and the same grain.
    # Measured before use: brightest pixel in the source patch sums to 35 of a
    # possible 765, against 417 in the ✕ itself — it is genuinely empty.
    X_BOX = (479, 65, 508, 100)      # the ✕ at (483,69)-(504,96), plus margin
    X_SRC_DX = -40                   # clean field, same rows
    patch = op.crop((X_BOX[0] + X_SRC_DX, X_BOX[1],
                     X_BOX[2] + X_SRC_DX, X_BOX[3]))
    op.paste(patch, (X_BOX[0], X_BOX[1]))
    op.putalpha(rounded_alpha(op.size, RADIUS))
    report.append(save(op, 'panel-options.webp') + (f'{op.width}x{op.height}',))

    # ── 3. the SETTINGS panel, from his EMPTY render ──────────────────────
    # The three pill sockets keep the empty outlines he drew — the ON/OFF
    # sprites are resized to exactly those rects, so his outline and theirs
    # coincide. The TIME OF DAY socket is blanked instead: his value boxes are
    # 537x101 (aspect 5.3) against a 219x63 socket (aspect 3.5), so they cannot
    # both be shown. Scaling a box to fill the socket would squash the
    # lettering by half, so the box goes in at its own aspect and HIS border on
    # it is the one that shows.
    sx0, sy0, sx1, sy1 = SETTINGS_PANEL
    sp = Image.open(os.path.join(SRC, 'settings-empty.png')).convert('RGBA')
    sp = sp.crop((sx0, sy0, sx1 + 1, sy1 + 1))
    d = ImageDraw.Draw(sp)
    for name, ax0, ay0, ax1, ay1 in SOCKETS:
        if name == 'tod':
            d.rectangle([ax0 - sx0, ay0 - sy0, ax1 - sx0, ay1 - sy0],
                        fill=PANEL_FILL + (255,))
    sp.putalpha(rounded_alpha(sp.size, RADIUS))
    report.append(save(sp, 'panel-settings.webp') + (f'{sp.width}x{sp.height}',))

    # ── 4. the state pieces, cut from ALIGNED sources ─────────────────────
    ref = Image.open(os.path.join(SRC, REFERENCE))
    ref_size = ref.size
    socket = {n: (a, b, c, d) for n, a, b, c, d in SOCKETS}
    for out_name, (fn, sock) in (('pill-on', SRC_PILL_ON),
                                 ('pill-off', SRC_PILL_OFF)):
        raw = Image.open(os.path.join(SRC, fn))
        fitted, (sx, sy) = align(raw, SETTINGS_PANEL, ref_size)
        cx0, cy0, cx1, cy1 = socket[sock]
        # ⚠️ ALIGNING THE PANEL IS NOT ENOUGH. He drew the pill at a different
        # size RELATIVE to the panel in each render — after alignment the
        # all-off pill is still 141 wide against a 114 socket — so cutting at
        # the socket rect slices his knob off. Find the pill's own bounds in a
        # window around the socket, then fit those to the socket. Measured
        # before this: the OFF knob was clipped flat on its left edge.
        pw, ph = cx1 - cx0 + 1, cy1 - cy0 + 1
        mx, my = pw // 2, ph // 2
        win = fitted.crop((cx0 - mx, cy0 - my, cx1 + mx + 1, cy1 + my + 1))
        wa = np.asarray(win.convert('RGB')).astype(int)
        lum = 0.299 * wa[..., 0] + 0.587 * wa[..., 1] + 0.114 * wa[..., 2]
        ink = (lum > np.percentile(lum, 5) + 12) & (np.asarray(win)[..., 3] > 0)
        # The bbox of ALL ink in the window is wrong — the window is wide
        # enough to touch the row above and below, and that measured the pill
        # at 175x105 inside a 228x106 window. Take the one connected shape
        # that covers the socket's centre instead.
        # Close hard enough to join the pill's outline, its knob and its
        # lettering into ONE shape — they are separate blobs otherwise, and
        # the socket's own centre lands in the gap between knob and word, so
        # "the shape under the middle" finds nothing at all.
        ink = ndimage.binary_closing(ink, np.ones((13, 13)))
        lab_p, n_p = ndimage.label(ink)
        if not n_p:
            raise SystemExit(f'{out_name}: nothing found near the socket')
        inside = np.zeros_like(ink)
        inside[my:my + ph, mx:mx + pw] = True
        overlap = ndimage.sum(inside, lab_p, range(1, n_p + 1))
        here = int(np.argmax(overlap)) + 1
        ys, xs = np.nonzero(lab_p == here)
        piece = win.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
        grew = (piece.width, piece.height)
        piece = piece.resize((pw, ph), Image.LANCZOS)
        report.append(save(piece, f'{out_name}.webp')
                      + (f'{piece.width}x{piece.height}  aligned '
                         f'{sx:.3f}/{sy:.3f}, pill {grew[0]}x{grew[1]}',))

    fn, tx0, tx1, rows = SRC_TOD
    tod_src = Image.open(os.path.join(SRC, fn)).convert('RGBA')
    _n, _sx0, _sy0, _sx1, _sy1 = [s for s in SOCKETS if s[0] == 'tod'][0]
    tod_w = _sx1 - _sx0 + 1
    for key, ty0, ty1 in rows:
        box = tod_src.crop((tx0, ty0, tx1 + 1, ty1 + 1))
        h = round(box.height * tod_w / box.width)
        box = box.resize((tod_w, h), Image.LANCZOS)
        report.append(save(box, f'tod-{key}.webp')
                      + (f'{box.width}x{box.height}  width-fit',))

    for path, kb, dims in report:
        print(f'{os.path.basename(path):24s} {dims:<30s} {kb:6.1f} KB')

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
