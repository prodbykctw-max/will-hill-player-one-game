#!/usr/bin/env python3
"""
Cut a GLOW off his own lettering, so the words light up instead of a box.

Client, looking at the first attempt: *"Instead of those square lines that are
glowing around buttons and stuff like that I think you just need to trace over
the text of each button as functional and make the text glow. It's all white
text so just make the text a white glow and you can intensify a little more too
so it's blatantly obvious."*

He is right, and the first version earned it: on painted controls the only thing
CSS can glow by itself is the transparent hit box, and a box-shadow on a
rectangle IS a rectangle stencilled onto his artwork. The words are in the
picture, so the glow has to come out of the picture.

WHAT THIS MAKES
---------------
One bloom layer per painted surface — an RGBA image the same size as the plate,
transparent everywhere except around the lettering of the controls that actually
do something. index.html screens it over the plate and pulses its opacity. So:

  * the shape of the glow is the shape of HIS letterforms, per control;
  * nothing is drawn where nothing is tappable (the coin slot stays dead);
  * no new art of mine lands on his — the layer only re-emits light his own
    ink already carries.

⚠️ PRE-RENDERED, NOT A CSS FILTER, and that is deliberate twice over. First,
`filter: drop-shadow` is applied BEFORE the mask in the paint order, so glowing
a masked layer clips the glow away to nothing — the halo lands exactly where the
mask has already removed it. Second, this pulses forever behind a running game:
animating opacity on a static bitmap is a compositor-only job, where a live blur
filter is a full repaint every frame on a phone that has a game to draw.

HOW THE INK IS FOUND — local background, not a threshold
--------------------------------------------------------
Ink is what is BRIGHTER THAN ITS OWN SURROUNDINGS, measured as value (the max
channel) minus a min-filtered version of itself. A flat threshold cannot do this
job on these plates: his menu text is amber on near-black, the CANCEL mark is
red on blue, and the ENTER button is a filled amber disc whose own lettering is
black. One number cannot separate all three, and the local rule separates all
three for free:

  text on a plate      the strokes stand above the plate      -> letters glow
  the red CANCEL disc  the rim stands above the blue          -> the disc glows
  the ENTER disc       its interior is its own background     -> only its rim

That last one is the useful accident: his ENTER already has a painted glow ring,
and the rim-only result pulses that ring rather than trying to make black
lettering emit white light.

⚠️ THE HALO IS THE GLOW; THE STROKE IS BARELY TOUCHED. bloom = blur(ink) - ink,
so the light appears AROUND each stroke and the stroke itself only lifts by
CORE. Screening a bright layer straight onto his letterforms would flatten his
own colour and anti-aliasing — which on a 3px stroke is most of the letter.

⚠️ THE PAINTED FRAMES ARE INSET OUT. His OPTIONS buttons are drawn as amber
rounded rectangles, and glowing those reproduces the exact thing he asked to
stop — a glowing rectangle, his own this time. Every rect below therefore carries
an inset chosen to clear the frame he drew and keep the words inside it. Look at
the preview before believing any of them.

Usage:
    python3 tools/cut_glow_glyphs.py                 # write every layer
    python3 tools/cut_glow_glyphs.py --preview       # + contact sheets to /tmp
    python3 tools/cut_glow_glyphs.py dash --b64      # base64, for the worker
"""
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UI = os.path.join(ROOT, 'src', 'assets', 'ui')
PREVIEW_DIR = os.environ.get('PREVIEW_DIR', '/tmp')

# Every rect is (id, left, top, width, height, (inset l, t, r, b)) — the first
# four as PERCENTAGES of the plate, copied from the same numbers index.html
# positions the hit target with, and the insets as fractions of the rect.
#
# ⚠️ THE INSETS ARE PER SIDE, because two of these needed it. His OPTIONS
# column runs to the plate's own metal edge and his CONTEST INFO column has a
# rule across its foot, and both are on ONE side of an otherwise well-fitting
# rect — a symmetric inset big enough to clear them eats the lettering.
#
# ⚠️ IF A RECT MOVES IN index.html IT MOVES HERE. These are two copies of one
# measurement; the harness (tools/harness/btnglow.mjs) checks that the bloom
# actually has ink inside every live button's rect, which is what catches a
# drift instead of leaving a control glowing next to itself.
SURFACES = {
    # His sign-up cabinet. Fractions of the whole plate == fractions of
    # #panelCard.cabinet-entry, because the plate IS the card here.
    'entry': dict(
        src='contest-entry.webp', out='glow-entry.webp',
        rects=[
            # NOT NOW / CANCEL — white on blue, inside a drawn border.
            ('btnSkip',      68.464, 38.612, 15.944,  5.531, (.09, .16, .09, .16)),
            # The red ✕ disc. No inset: the disc is the control.
            ('btnFormX',     71.395, 44.144,  9.144,  4.501, (.02, .02, .02, .02)),
            # ENTER — a filled disc, so this comes out as its rim.
            ('btnSave',      35.404, 56.941, 27.198, 14.371, (.02, .02, .02, .02)),
            ('btnFormBoard', 66.823, 57.213, 32.239,  7.049, (.02, .06, .13, .06)),
            ('btnFormRules', 66.823, 65.347, 32.239,  7.049, (.02, .06, .13, .06)),
            # The CONTEST INFO column beside the screen.
            ('btnFormInfo',  84.408, 34.978, 10.199, 21.909, (.05, .03, .05, .10)),
            # The small ✕ on the card's own heading.
            ('panelClose',   55.100, 28.091,  5.158,  2.494, (.02, .02, .02, .02)),
        ]),
    # The OPTIONS screen that drops into the MARTA housing. Fractions of the
    # PLATE, which index.html expresses as fractions of #panelScreen.
    # ⚠️ The four menu rects are measured to his drawn frames, so the inset has
    # to clear them: 0.10 of 474px is 47px against a 4px border, and 0.30 of
    # 148px is 44px against text about 24px tall in the middle.
    'options': dict(
        src='panel-options.webp', out='glow-options.webp',
        rects=[
            ('btnMenuBoard',     6.59, 21.06, 86.81, 14.77, (.10, .30, .10, .30)),
            ('btnMenuHow',       6.59, 40.52, 86.81, 14.57, (.10, .30, .10, .30)),
            ('btnMenuSettings',  6.59, 59.78, 86.81, 14.37, (.10, .30, .10, .30)),
            ('btnMenuClose',     6.59, 78.84, 86.81, 14.17, (.10, .30, .10, .30)),
            # The painted ✕, found by ink search rather than by eye — see
            # find_mark(). #panelClose's own rect is a fraction of the CARD,
            # so it cannot be reused here.
            ('panelClose',      86.80,  6.10,  6.20,  3.60, (0, 0, 0, 0)),
        ]),
    'settings': dict(
        src='panel-settings.webp', out='glow-settings.webp',
        rects=[
            # BACK. The three switches are separate sprites drawn by CSS over
            # this plate, not part of it, so a plate bloom cannot reach them —
            # and they are already unmistakably switches, with his own ON and
            # OFF states.
            ('btnBack',          6.61, 62.37, 87.17,  5.84, (.10, .24, .10, .24)),
        ]),
    # ── HIS CONTEST DASHBOARD ────────────────────────────────────────────
    # Client: "The dashboard also needs to have the buttons that are actual
    # working buttons more noticeably apparent."
    #
    # Exactly the same problem as the game's cabinet screens and exactly the
    # same fix. His dashboard painting has a lot of boxes on it and only seven
    # of them do anything: everything else — the ENTRANTS tile, the heatmap
    # frame, STAGE PROGRESSION, the MARTA console at the foot — is a readout.
    # A first-time reader has no way to tell which is which, and the two that
    # matter most (the filter and DOWNLOAD CSV) sit in a row of identical
    # panels.
    #
    # ⚠️ THE SOURCE IS THE CONCEPT PNG, NOT THE WORKER. The dashboard plate
    # lives base64'd inside cloudflare/dashboard-worker.js, so the layer is cut
    # from assets/ui-concept/dashboard-empty.png — the same file
    # tools/cut_dash_cab.py and tools/cut_dash_chips.py read — and printed as
    # base64 with --b64 to be pasted in beside it.
    #
    # Rects are the same percentages the worker's stylesheet positions the hit
    # targets with, over an 853x1844 plate. Two copies of one measurement, as
    # ever; the harness checks the bloom actually has ink inside each live
    # control's rect, which is what catches a drift.
    'dash': dict(
        # ⚠️ BOTH PATHS ARE REPO-RELATIVE, not relative to src/assets/ui like
        # the game's plates. This layer never ships as a file — it goes into the
        # worker as base64 — so it is kept beside the concept art it was cut
        # from rather than in the game's asset tree, where Vite would not bundle
        # it anyway and it would only look like a live asset.
        root=True,
        src='assets/ui-concept/dashboard-empty.png',
        out='assets/ui-concept/glow-dash.webp',
        rects=[
            # FILTER NAME OR PHONE, and DOWNLOAD CSV beside it. Both are drawn
            # as bordered boxes, so both need the inset — glowing his border
            # is the rectangle complaint again.
            ('q',       45.838,  9.463, 24.912, 3.20, (.06, .22, .06, .22)),
            ('csv',     73.153,  9.463, 12.544, 3.20, (.06, .22, .06, .22)),
            # The three VIEW chips. Their lit/unlit sprites are drawn as CSS
            # backgrounds OVER the plate, so this glows the plate's own painted
            # copy underneath — which lands as a halo around whichever sprite is
            # showing, since both were cut from the same glyphs.
            ('mWorld',  20.281, 42.408,  6.448, 1.518, (.10, .22, .10, .22)),
            ('mUS',     27.198, 42.408, 11.840, 1.518, (.10, .22, .10, .22)),
            ('mATL',    39.976, 42.408,  7.737, 1.518, (.10, .22, .10, .22)),
            # ALL ENTRANTS and RECENT REJECTIONS — tap either heading to open
            # the full table. Nothing about a heading says "tappable", which is
            # why he could not find them. The rule drawn under each one is
            # killed by the unbroken-run rule, not by an inset.
            ('xEnt',    13.013, 76.790, 73.388, 2.115, (.01, .06, .40, .10)),
            ('xRej',    13.013, 84.707, 73.388, 1.844, (.01, .06, .40, .10)),
        ]),
}

# ⚠️ TUNED AGAINST SCREENSHOTS, not taste in the abstract — "you can intensify
# a little more too so it's blatantly obvious". The first pass measured a 12%
# luminance lift on his OPTIONS labels between the dim and lit ends of the
# pulse, which read as tasteful and not as obvious. These are the numbers that
# doubled it without washing his ink: the stroke lifts further, and the widest
# blur reaches further so the light is read as light rather than as a thicker
# letter.
CORE = 0.44        # how much the stroke itself lifts — his ink stays his ink
HALO = 1.00        # peak of the light around it
WHITEN = 0.22      # push the glow's hue toward white without recolouring it
RADII = (3.0, 10.0, 30.0)         # at the reference width below
WEIGHTS = (1.00, 0.62, 0.34)
REF_W = 853.0


def value(rgb):
    """Perceived presence of ink: the max channel. Handles saturated colour —
    a red mark on blue reads as ink here and would not under luminance."""
    return rgb.max(axis=2).astype(np.float32)


def find_mark(v, box):
    """Tighten a hand-guessed box onto the ink actually inside it."""
    x0, y0, x1, y1 = box
    sub = v[y0:y1, x0:x1]
    if sub.size == 0:
        return box
    thr = sub.min() + 0.45 * (sub.max() - sub.min())
    ys, xs = np.where(sub > thr)
    if len(xs) < 8:
        return box
    return (x0 + xs.min(), y0 + ys.min(), x0 + xs.max() + 1, y0 + ys.max() + 1)


def ink_of(plate_v, box, win):
    """Ink alpha inside box: value above a min-filtered local background.

    The window has to be wider than a stroke and narrower than a feature, or
    the strokes become their own background and vanish."""
    x0, y0, x1, y1 = box
    crop = plate_v[y0:y1, x0:x1]
    if crop.size == 0:
        return np.zeros((0, 0), np.float32)
    pad = win
    p = np.pad(crop, pad, mode='edge')
    bg = np.asarray(Image.fromarray(p.astype(np.uint8)).filter(
        ImageFilter.MinFilter(win * 2 + 1))).astype(np.float32)[pad:-pad, pad:-pad]
    d = crop - bg
    span = max(18.0, float(np.percentile(d, 99.5)))
    return np.clip((d - 0.16 * span) / (0.72 * span), 0.0, 1.0)


def longest_run(hit):
    """Longest contiguous True run along axis 1, per row, as a fraction."""
    n = hit.shape[1]
    best = np.zeros(hit.shape[0], np.int32)
    cur = np.zeros(hit.shape[0], np.int32)
    for i in range(n):
        col = hit[:, i]
        cur = np.where(col, cur + 1, 0)
        best = np.maximum(best, cur)
    return best / max(n, 1)


def drop_lines(a, thr=0.85):
    """Zero any row or column the ink crosses in one UNBROKEN stroke.

    ⚠️ THIS IS THE RULE THAT KEEPS HIS FRAMES DARK, and it exists because the
    insets alone were not enough. The OPTIONS column on the sign-up cabinet
    reaches the plate's own metal edge, and the CONTEST INFO column has a
    painted divider across it — both came out as bright bars in the first
    preview, which is the glowing-rectangle complaint all over again in a
    different shape. So this needs no per-plate tuning and it catches the next
    plate too, which an inset cannot.

    ⚠️ UNBROKEN IS THE TEST, not how much of the row is covered — and that took
    two wrong versions to land on. Averaging alpha missed soft-edged bars (a
    full-height edge at alpha 0.35 averages 0.35 and reads as "not a line").
    Counting covered pixels instead then ate the CONTEST INFO column, where the
    rect is only 79px wide and a line of type genuinely covers most of its row:
    it sliced horizontal gaps straight through "See rules, prizes and full
    details." and through the CANCEL disc.

    What actually separates a drawn line from a line of type is that type is
    BROKEN — by the gaps between letters and, because this traces outlines,
    inside them too. A border crosses in one stroke. So the measure is the
    longest unbroken run, and it holds in a 79px column and a 474px one alike.
    """
    if a.size == 0:
        return a
    a = a.copy()
    hit = a > 0.15
    a[longest_run(hit) > thr, :] = 0.0
    a[:, longest_run(hit.T) > thr] = 0.0
    return a


def blur(a, r):
    return np.asarray(Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))
                      .filter(ImageFilter.GaussianBlur(r))).astype(np.float32) / 255.0


def build(name, cfg, preview=False, b64=False):
    home = ROOT if cfg.get('root') else UI
    src = os.path.join(home, cfg['src'])
    im = Image.open(src)
    if im.mode not in ('RGB', 'RGBA'):
        im = im.convert('RGB')
    rgb = np.asarray(im.convert('RGB')).astype(np.float32)
    H, W, _ = rgb.shape
    v = value(rgb)
    k = W / REF_W
    win = max(4, int(round(7 * k)))

    ink = np.zeros((H, W), np.float32)
    report = []
    for (bid, l, t, w, h, ins) in cfg['rects']:
        x0, y0 = int(round(l / 100 * W)), int(round(t / 100 * H))
        x1, y1 = int(round((l + w) / 100 * W)), int(round((t + h) / 100 * H))
        bw, bh = x1 - x0, y1 - y0
        box = (x0 + int(round(bw * ins[0])), y0 + int(round(bh * ins[1])),
               x1 - int(round(bw * ins[2])), y1 - int(round(bh * ins[3])))
        if bid == 'panelClose' and name == 'options':
            box = find_mark(v, box)
        a = drop_lines(ink_of(v, box, win))
        ink[box[1]:box[3], box[0]:box[2]] = np.maximum(
            ink[box[1]:box[3], box[0]:box[2]], a)
        report.append((bid, box, float(a.mean()), float(a.max())))

    # The halo: several blurs so it has a tight bright edge and a wide soft
    # falloff, minus the ink itself so the light lands AROUND the strokes.
    acc = np.zeros_like(ink)
    for r, wt in zip(RADII, WEIGHTS):
        acc = np.maximum(acc, blur(ink, r * k) * wt)
    peak = float(acc.max()) or 1.0
    halo = np.clip(acc / peak - ink, 0.0, 1.0)
    alpha = np.clip(halo * HALO + ink * CORE, 0.0, 1.0)

    # Colour: his own ink, spread outward by an alpha-weighted blur so the
    # halo is the same hue as the letter it came from — which on the sign-up
    # cabinet is the white glow he asked for, and on OPTIONS is his amber.
    wsum = blur(ink, RADII[1] * k) + 1e-4
    col = np.stack([blur(rgb[..., c] / 255.0 * ink, RADII[1] * k) / wsum
                    for c in range(3)], axis=2)
    m = col.max(axis=2, keepdims=True)
    col = np.where(m > 0.02, col / np.maximum(m, 1e-4), 1.0)      # full value
    col = col * (1 - WHITEN) + WHITEN

    out = np.dstack([(np.clip(col, 0, 1) * 255).astype(np.uint8),
                     (alpha * 255).astype(np.uint8)])
    dst = os.path.join(home, cfg['out'])
    Image.fromarray(out, 'RGBA').save(dst, 'WEBP', quality=88, method=6, exact=True)
    if b64:
        import base64
        import io
        buf = io.BytesIO()
        Image.fromarray(out, 'RGBA').save(buf, 'WEBP', quality=86, method=6, exact=True)
        enc = base64.b64encode(buf.getvalue()).decode()
        # ⚠️ SAFE INSIDE THE WORKER'S TEMPLATE LITERAL. The base64 alphabet is
        # A-Z a-z 0-9 + / = — no backtick and no `${`, both of which have broken
        # the parse of dashboard-worker.js before.
        bp = os.path.join(PREVIEW_DIR, os.path.basename(cfg['out']) + '.b64.txt')
        print(f'  base64 {len(enc) / 1024:.1f} KB -> {bp}')
        with open(bp, 'w') as f:
            f.write(enc)

    print(f'\n{name}: {cfg["src"]} {W}x{H} -> {cfg["out"]} '
          f'{os.path.getsize(dst) / 1024:.0f}KB')
    print(f'  lit fraction of the plate: {(alpha > 0.06).mean() * 100:.2f}%'
          f'   peak alpha {alpha.max() * 255:.0f}')
    for bid, box, mean, mx in report:
        flag = '  ⚠️ NO INK' if mx < 0.5 else ''
        print(f'  {bid:16s} x{box[0]:>4}-{box[2]:<4} y{box[1]:>4}-{box[3]:<4}'
              f'  coverage {mean * 100:5.1f}%  peak {mx:.2f}{flag}')

    if preview:
        base = rgb / 255.0
        lit = 1 - (1 - base) * (1 - np.clip(col, 0, 1) * alpha[..., None])
        sheet = Image.fromarray((lit * 255).astype(np.uint8))
        sheet.thumbnail((520, 1400))
        p = os.path.join(PREVIEW_DIR, f'glowpreview-{name}.png')
        sheet.save(p)
        # And the alpha on its own, which is where a stray frame shows up.
        am = Image.fromarray((alpha * 255).astype(np.uint8))
        am.thumbnail((520, 1400))
        am.save(os.path.join(PREVIEW_DIR, f'glowalpha-{name}.png'))
        print(f'  preview {p}')


def main():
    preview = '--preview' in sys.argv
    b64 = '--b64' in sys.argv
    only = [a for a in sys.argv[1:] if not a.startswith('-')]
    for name, cfg in SURFACES.items():
        if only and name not in only:
            continue
        build(name, cfg, preview, b64)


if __name__ == '__main__':
    main()
