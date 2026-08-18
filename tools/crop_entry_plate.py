#!/usr/bin/env python3
"""
Crop his ENTER CONTEST cabinet to the top portion, and give it a SAVE control.

Client, sending the crop he wants: *"crop this image out of the contest
registration image. It will alone be the sole contest reg view."*

WHAT COMES OFF, AND WHY THAT COSTS A BUTTON
-------------------------------------------
The plate is 853x1844 and the cut is at y992 — full width, marquee down to the
bottom edge of the screen bezel. That row is not a guess: y991 is the darkest
row in the whole band (value 22 across the plate, 1.3 across the card) and y993
is the bright bevel of the panel below it, so the cut lands on a line he
painted. It is also, to the pixel, where the aspect ratio of the crop he sent
puts it.

Everything below y992 goes, and that includes three live controls:

    #btnSave        his gold ENTER disc, centred (418,1182) r116
    #btnFormBoard   the LEADERBOARD row
    #btnFormRules   the RULES & PRIZES row

The last two cost nothing reachable — #btnFormInfo already opens the same view
#btnFormRules did (he drew two doors to one room), and post-run NOT NOW already
lands on the board. #btnSave is the problem: cropping the cabinet throws away
its submit button, which is why docs/NEXT_CHAT.md 4.3 says the silver knob has
to become the save control. That is what this script builds.

⚠️ CROP FIRST, THEN OVERLAY. The overlay only reads as an overlay once the card
is short; a full-height cabinet laid over HOW TO PLAY covers it completely,
which is the full-screen form with extra steps.

THE GREEN TICK IS HIS BUTTON, WITH HIS STROKE
---------------------------------------------
His cabinet already teaches that the round buttons in that column are the
actions: red X is cancel, so a green tick is confirm, and the pair reads with
no words to translate. The question was where a tick comes from without
repainting his artwork.

The BUTTON is entirely his — rim, bevel, gradient, specular highlight, drop
shadow — and so is the ink. Only the two segments' geometry is new:

    1. find the cross's strokes inside the inner circle, and the disc's centre
    2. inpaint them away with a RADIAL median: for each pixel, the median of
       the non-ink pixels at the same radius. His button is concentric, so
       same-radius medians rebuild the rings exactly. A per-ROW median — the
       trick tools/edit_enter_button.py and tools/cut_dash_chips.py use, and
       what this tried first — is right for a flat pill and wrong here: it
       smears his inner ring into broken arcs, which is very visible.
    3. draw the tick at his measured stroke width, in his measured ink, dark
       edge under light core so it carries his bevel, supersampled 4x so the
       anti-aliasing matches his
    4. swap the R and G channels

⚠️ A CROSS IS NOT HALF A TICK, and the obvious idea does not work. A cross is
four arms from a centre and a tick is two of them, so the first version kept
his up-left and up-right arms and masked the rest. It comes out a V: his arms
are equal length at equal angles, and a tick needs roughly 1:2 arms at
different ones. Masking cannot make one arm longer than he drew it.

⚠️ NOTHING HERE PICKS A COLOUR. Step 4 is a channel permutation, so his red
gradient becomes the identical gradient in green; the ink is sampled off his
own cross; his strokes are near-neutral so the swap leaves them alone.

⚠️ IF HE WOULD RATHER DRAW IT, THIS BECOMES A PASTE. He took exactly that
option on the settings pills — "I CAN LITERALLY EDIT THE IMAGE TO EXACTLY AS
NEEDED" — and a tick he drew beats a tick fitted to his cross. Drop a PNG at
assets/ui-concept/contest-confirm.png and it is used instead.

⚠️ PIPELINE ORDER. tools/edit_enter_button.py's docstring ends with a command
that re-emits src/assets/ui/contest-entry.webp from the FULL-SIZE png. Running
that after this one silently restores the uncropped plate and every fraction in
index.html is then wrong by a factor of 1.86, which looks like a layout bug
rather than a stale asset. This script goes png -> cropped webp in one pass so
there is no intermediate to run things against; it is the last word on that
file. Same warning is on edit_enter_button.py.

Usage:
    python3 tools/crop_entry_plate.py              # write the asset + print the maths
    python3 tools/crop_entry_plate.py --preview    # + contact sheets to /tmp
    python3 tools/crop_entry_plate.py --map 0.44144 0.38612
"""
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'ui-concept', 'contest-entry.png')
OUT = os.path.join(ROOT, 'src', 'assets', 'ui', 'contest-entry.webp')
DRAWN = os.path.join(ROOT, 'assets', 'ui-concept', 'contest-confirm.png')
PREVIEW_DIR = os.environ.get('PREVIEW_DIR', '/tmp')

OLD_W, OLD_H = 853, 1844
# The cut. Measured: y991 is the darkest row across the plate and y993 is the
# bevel highlight under it, so 992 keeps his black rule as the bottom edge.
CUT = 992
NEW_W, NEW_H = OLD_W, CUT

# His red CANCEL disc, and the knob it is going to replace. Both measured off
# the plate by threshold-and-occupancy, not by eye — see the run in
# docs/TECHNIQUES.md. The knob is the only bright thing in the housing panel
# between the F-J column (ends x587) and the CONTEST INFO strip (starts x709).
XDISC = (612, 814, 692, 899)      # x0, y0, x1, y1
KNOB = (603, 537, 694, 635)
# The disc is composited a little larger than the knob so the knob's own outer
# shadow cannot peek out from under it. 1.12 covers x597-699, y531-641, and
# nothing else on the plate lives in that box.
COVER = 1.12
# His cross, measured off the plate rather than eyeballed: the ink saturates at
# radius 28 from the disc's centre (564px of it) and stops — everything further
# out is rim highlight, which is why the ink search is radius-limited.
CROSS_R = 28.0
INPAINT_R = 31.0        # fill out to just past the cross, leaving the rim alone
STROKE_W = 7            # his, from the 45deg-rotated occupancy of the cross
INK_CORE = (173, 169, 163)
INK_EDGE = (148, 138, 133)
# His button's INNER RING, measured off the radial profile of the disc: the
# fill dips 11 levels at r21-22 and jumps 17 back at r24, which is the groove
# and its lit edge. So the perimeter the tick has to sit inside is r=22.5.
# ⚠️ HIS OWN CROSS OVERSHOT IT — the cross reaches r=28, so its four tips
# cross the ring rather than sitting in it. Do not use the cross's radius as
# the target; that is what "needs a little more padding inside of that green
# button" is about.
INNER_R = 22.5
FIT_PAD = 0.90          # breathing room between the ink and his ring
# The tick in unit-free coordinates — proportions only. Nothing here is a
# position or a size: the fitting below decides both. Short arm to long arm is
# about 1:2.1, which is what separates a tick from a V.
TICK = [(0.00, 0.32), (0.36, 0.72), (1.00, -0.18)]
SS = 4                  # supersample, so the anti-aliasing matches his


def vmap(v):
    """A vertical fraction of the old plate, as a fraction of the crop.

    The crop starts at y0 and keeps full width, so this is one factor and
    horizontal fractions do not move at all."""
    return v * OLD_H / NEW_H


def _parts(disc):
    """His CANCEL button, split into (strokes, disc centre) — both measured.

    The strokes are the only near-neutral bright thing inside a saturated red
    disc, so value-and-desaturation separates them without a hue guess. The
    search is radius-limited because the button's own rim highlight is also
    bright and also near-neutral, and an unbounded search reports the cross as
    reaching r=38 when it actually stops at 28."""
    a = np.asarray(disc).astype(np.int32)
    h, w, _ = a.shape
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    val = a.max(axis=2)
    sat = val - a.min(axis=2)
    red = (r > 90) & (r - g > 40) & (r - b > 40)
    ys, xs = np.where(red)
    cx, cy = xs.mean(), ys.mean()
    yy, xx = np.mgrid[0:h, 0:w]
    dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    # ⚠️ SATURATION, NOT BRIGHTNESS, and generously. Cutting on `val > 120`
    # leaves the cross's own shaded edge behind — a grey smudge that survives
    # the inpaint and sits right under the new tick's vertex, where it is most
    # visible. His red runs at saturation ~135 and his strokes under 60, so
    # anything below 90 inside the cross's radius is ink and nothing red is
    # caught by it.
    strokes = (sat < 90) & (dist < CROSS_R + 2)
    return a, strokes, dist, (cx, cy)


def build_tick(plate):
    """His CANCEL button with the cross inpainted out and a tick in its place."""
    if os.path.exists(DRAWN):
        print('using his own drawn tick:', os.path.basename(DRAWN))
        return Image.open(DRAWN).convert('RGBA')

    disc = plate.crop(XDISC).convert('RGB')
    a, strokes, dist, (cx, cy) = _parts(disc)
    h, w, _ = a.shape

    # ── 1. inpaint the cross away, RADIALLY ────────────────────────────────
    # His button is concentric: a flat fill leaves a disc-within-a-disc and a
    # per-row median breaks his inner ring into arcs. The median of the clean
    # pixels at the same radius rebuilds the ring it belongs to.
    grow = np.asarray(Image.fromarray((strokes * 255).astype(np.uint8))
                      .filter(ImageFilter.MaxFilter(7))) > 127
    fill = grow & (dist < INPAINT_R)
    out = a.copy()
    rbin = dist.astype(np.int32)
    # ⚠️ THE INNERMOST RINGS HAVE NO CLEAN PIXELS AT ALL. The cross crosses its
    # own centre, so for the first few radii every pixel is ink and there is
    # nothing to take a median of. Leaving those alone — which is what a plain
    # `continue` does — leaves the middle of his cross sitting under the new
    # tick's vertex as a grey chevron, and widening the ink mask makes it
    # WORSE rather than better, because more of the centre becomes unfillable.
    # So: take every ring's median first, then fill the empty ones from the
    # nearest ring that has one.
    med = {}
    for k in range(int(INPAINT_R) + 1):
        clean = (rbin == k) & ~grow
        if clean.sum() >= 3:
            med[k] = np.median(a[clean], axis=0)
    if not med:
        raise SystemExit('no clean pixels anywhere in the disc — re-measure')
    for k in range(int(INPAINT_R) + 1):
        target = (rbin == k) & fill
        if not target.any():
            continue
        near = min(med, key=lambda j: abs(j - k))
        out[target] = med.get(k, med[near])

    # ⚠️ AND A SECOND PASS FOR WHAT THE INK MASK MISSED. The cross carries a
    # dark contact shadow along its edges that is neither neutral enough to be
    # ink nor red enough to survive as fill, so a couple of pixels of it come
    # through the first pass and read as a speck on the finished button — right
    # at the tick's arm tip, where the eye is already going. Nothing about
    # "grow the mask harder" fixes it without eating his ring.
    #
    # The ring medians already computed are the answer: inside the perimeter
    # his button IS radially uniform, so a pixel that differs from its own
    # ring by more than SPECK levels is a leftover, whatever its hue. Bounded
    # to INNER_R because further out the rim highlight is legitimately not
    # uniform and this would flatten it.
    SPECK = 25
    for k in range(int(INNER_R) + 1):
        ring = rbin == k
        if k not in med or not ring.any():
            continue
        off = np.abs(out - med[k]).max(axis=2)
        stray = ring & (off > SPECK)
        if stray.any():
            out[stray] = med[k]

    # ── 2. fit the tick INSIDE his ring, then draw it ──────────────────
    # Geometry rather than eye. The stroked tick is the Minkowski sum of the
    # polyline with a disc of the stroke's half-width, so for any centre the
    # farthest ink is at a VERTEX plus that half-width — distance along a
    # segment is convex, so it peaks at an end. That makes the enclosing
    # radius exact rather than an estimate, and it can be solved rather than
    # nudged:
    #
    #   centre  the stroked bounding box's centre, which is what reads as
    #           centred for a shape as lopsided as a tick (its area centroid
    #           pulls down-right, and its vertex centroid pulls up-right)
    #   scale   so that (max vertex distance + half-width) == INNER_R * FIT_PAD
    #
    # ⚠️ THE STROKE DOES NOT SCALE WITH IT. STROKE_W is his, measured off his
    # own cross, and the button is the same size it always was — so the
    # polyline is fitted to the space LEFT OVER after his stroke, not scaled
    # along with it.
    hw = (STROKE_W + 2) / 2.0                      # the outer, darker pass
    px = [p[0] for p in TICK]
    py = [p[1] for p in TICK]
    # The stroke is symmetric, so it grows the box's edges but never moves its
    # centre — which means the centre can be taken off the bare polyline.
    c0 = ((min(px) + max(px)) / 2.0, (min(py) + max(py)) / 2.0)
    reach = max(np.hypot(x - c0[0], y - c0[1]) for x, y in TICK)
    scale = (INNER_R * FIT_PAD - hw) / reach
    pts = [((cx + (x - c0[0]) * scale) * SS, (cy + (y - c0[1]) * scale) * SS)
           for x, y in TICK]

    big = Image.fromarray(out.astype(np.uint8), 'RGB').resize(
        (w * SS, h * SS), Image.LANCZOS)
    d = ImageDraw.Draw(big)
    for width, ink in ((STROKE_W + 2, INK_EDGE), (STROKE_W, INK_CORE)):
        d.line(pts, fill=ink, width=width * SS, joint='curve')
        # PIL's `joint='curve'` rounds the joins but leaves the ENDS square,
        # and his cross's arms are capped. A disc at each vertex is the cap.
        for qx, qy in pts:
            r2 = width * SS / 2
            d.ellipse([qx - r2, qy - r2, qx + r2, qy + r2], fill=ink)
    out = np.asarray(big.resize((w, h), Image.LANCZOS)).astype(np.int32)

    # ── 3. red -> green, as a channel swap ─────────────────────────────────
    # Not a hue-rotate with a chosen angle: swapping R and G maps his exact
    # gradient onto green and leaves his near-neutral strokes alone, so no
    # colour in the result is one I picked.
    out = out[..., [1, 0, 2]]

    img = Image.fromarray(out.astype(np.uint8), 'RGB').convert('RGBA')
    # A feathered circular alpha, so what lands on the housing is the button
    # and not a square of the background it was cut from.
    mask = Image.new('L', (w * SS, h * SS), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, w * SS - 1, h * SS - 1], fill=255)
    img.putalpha(mask.resize((w, h), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.6)))
    return img


def main():
    if '--map' in sys.argv:
        for raw in sys.argv[sys.argv.index('--map') + 1:]:
            f = float(raw)
            print(f'{f:.5f}  ->  vertical {vmap(f):.5f}   (horizontal unchanged)')
        return

    plate = Image.open(SRC).convert('RGB')
    if plate.size != (OLD_W, OLD_H):
        raise SystemExit(f'expected {OLD_W}x{OLD_H}, got {plate.size} — re-measure')

    tick = build_tick(plate)

    # Composite over the knob, centred on it and a little oversized.
    kx0, ky0, kx1, ky1 = KNOB
    kcx, kcy = (kx0 + kx1) / 2, (ky0 + ky1) / 2
    tw, th = int(round((kx1 - kx0) * COVER)), int(round((ky1 - ky0) * COVER))
    tick = tick.resize((tw, th), Image.LANCZOS)
    out = plate.convert('RGBA')
    out.alpha_composite(tick, (int(round(kcx - tw / 2)), int(round(kcy - th / 2))))

    cropped = out.crop((0, 0, NEW_W, NEW_H)).convert('RGB')

    # ── THE TINY ✕ COMES OFF THE ENTER THE CONTEST CARD ───────────────────
    # Client: "there is also an X on the screen of the contest entry thing
    # that doesn't need to be an ex — basically exes don't need to be places
    # to have back buttons."
    #
    # He is right about this screen twice over: his own painted red disc a few
    # hundred pixels away is already labelled NOT NOW / CANCEL and does the
    # identical thing (both #entryClose and #btnFormX call notNow), so the ✕
    # was a second, smaller, unlabelled copy of a control he had already drawn
    # properly. #entryClose was only a transparent hit target over this paint.
    #
    # Measured, not eyeballed: the white ink is 13x14 at (486,534)-(498,547),
    # and it carries a dark drop shadow that widens the real footprint to
    # x484-499. The erase box takes the lot with margin. Outside that span the
    # field is uniform 64-75 across every column checked, so nothing of his
    # card border is anywhere near it — the dark pixels inside the box are the
    # ✕'s own shadow, which is exactly what has to go with it.
    ENTRY_X_BOX = (480, 528, 505, 554)
    ENTRY_X_SRC_DX = -40      # flat blue, same rows: range of 17 levels
    ex0, ey0, ex1, ey1 = ENTRY_X_BOX
    patch = cropped.crop((ex0 + ENTRY_X_SRC_DX, ey0, ex1 + ENTRY_X_SRC_DX, ey1))
    cropped.paste(patch, (ex0, ey0))

    cropped.save(OUT, 'WEBP', quality=82, method=6)
    print(f'wrote {OUT}  {NEW_W}x{NEW_H}  {os.path.getsize(OUT) / 1024:.0f}KB')

    if '--preview' in sys.argv:
        p = os.path.join(PREVIEW_DIR, 'entry-crop.png')
        cropped.save(p)
        q = os.path.join(PREVIEW_DIR, 'entry-tick.png')
        z = 4
        Image.alpha_composite(
            out.crop((kx0 - 20, ky0 - 20, kx1 + 20, ky1 + 20)).convert('RGBA'),
            Image.new('RGBA', (kx1 - kx0 + 40, ky1 - ky0 + 40), (0, 0, 0, 0))
        ).resize(((kx1 - kx0 + 40) * z, (ky1 - ky0 + 40) * z), Image.NEAREST).save(q)
        print('preview:', p, 'and', q)

    print(f'\naspect-ratio: {NEW_W} / {NEW_H}   (was {OLD_W} / {OLD_H})')
    print('vertical fractions move by x%.4f; horizontal ones DO NOT MOVE.'
          % (OLD_H / NEW_H))
    print('⚠️ no cqw correction: unlike tools/trim_lb_card.py this card is sized')
    print('   by WIDTH as an overlay, so 1cqw still buys the same painted width.')
    print('\n  control                 old top   new top   old h    new h')
    for name, top, height in [
        ('#panelClose', 28.091, 2.494),
        ('#formErr', 28.091, 3.362),
        ('label:has(#fName)', 32.538, 5.152),
        ('label:has(#fPhone)', 39.208, 5.152),
        ('label:has(#fEmail)', 45.879, 5.152),
        ('#btnSkip', 38.612, 5.531),
        ('#btnFormX', 44.144, 4.501),
        ('#btnFormInfo', 34.978, 21.909),
    ]:
        nt, nh = vmap(top / 100) * 100, vmap(height / 100) * 100
        flag = '  ⚠️ overruns 100 — clamp' if nt + nh > 100 else ''
        print(f'  {name:22s} {top:7.3f}  {nt:8.3f}  {height:6.3f}  {nh:7.3f}{flag}')
    print(f'\n  #btnSave moves onto the knob:')
    print(f'    left {kx0 / OLD_W * 100:.3f}%   top {ky0 / NEW_H * 100:.3f}%'
          f'   width {(kx1 - kx0) / OLD_W * 100:.3f}%   height {(ky1 - ky0) / NEW_H * 100:.3f}%')


if __name__ == '__main__':
    main()
