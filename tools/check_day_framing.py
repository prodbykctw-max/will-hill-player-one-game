#!/usr/bin/env python3
"""
Check that a stage's DAY plate is framed like its NIGHT plate, and say what
`groundFrac` and `meters` it needs if it is not.

WHY THIS EXISTS.

Each stage has two paintings of the same corner, one at night and one in the
day. They are separate generations, not recolours, so they do not share a
resolution, a crop, or a framing — eav is 1536x566 and eav-day is 1532x543,
and neither number means anything on its own. What has to match is what the
PLAYER sees: the fence should be the same height under his feet at noon as at
midnight, and the bottom of the tree should be visible in both.

Two values in src/world/stages.js control that:

    groundFrac  where the painting's own ground line is, as a fraction down
                the file. Everything at or below it is cropped off, because
                the game draws its own street there.
    meters      how tall the surviving crop is in the real world.

Get groundFrac wrong and you cut the picture off ABOVE its own ground — which
is what eav-day was doing at 0.766, slicing through the middle of the fence
and throwing away the footings, the grass verge and the base of the tree, and
what l5p-day was doing at 0.677, cutting through the shop windows. Get meters
wrong and the same building is a different size by day.

⚠️ HOW NOT TO MEASURE THIS: 1-D EDGE PROFILES.

The values being replaced were set "by aligning the day plate's row-wise
edge-energy profile against its night twin's". That method was tried again
here, carefully, with the sky excluded and with scale and offset solved
together, and it returned groundFrac 1.595 for eav — a row 866 of a 543-row
image. It fails for a reason that will not go away with tuning: collapsing an
image to one number per row throws away everything that says WHICH feature a
peak belongs to, so a scale-and-shift search has a large family of nearly
equal-scoring answers and picks whichever noise favours. Do not resurrect it.

WHAT IT DOES INSTEAD: ONE NAMED LANDMARK, MATCHED IN 2-D.

A patch of the night plate around something unmistakable — the WELCOME TO EAST
ATLANTA sign, the CRIMINAL RECORDS board — is searched for in the day plate
across a sweep of scales, by normalised cross-correlation. NCC is invariant to
brightness and contrast, which is the whole difficulty of comparing a night
paintingto a day one, and a 2-D match cannot confuse the top of a billboard
with the bottom of a canopy the way a row profile can.

The scale that wins IS the ratio between the two paintings, and the position
that wins pins the offset. Everything else is arithmetic:

    day_row = a * night_row + b
    groundFrac_day = (a * night_ground_row + b) / day_height
    meters_day     = (night world-units-per-px / a) * day_crop_px / WORLD_PER_M

`--proof` draws the matched box on both plates and interleaves them warped
into a common frame, because a number that has not been looked at is a guess
with decimal places.

Usage:
    python3 tools/check_day_framing.py
    python3 tools/check_day_framing.py eav --proof
"""
import os
import sys

import cv2
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BG = os.path.join(ROOT, 'src', 'assets', 'backgrounds')

WORLD_PER_M = 84.07   # must match src/world/scale.js

# night, day, night groundFrac, night meters, CURRENT day groundFrac/meters,
# and the LANDMARK: a box on the NIGHT plate, read off the plate itself.
#
# Landmarks are chosen to be large, hard-edged, and present in both paintings
# — a sign board rather than a tree, which the two generations draw
# differently. Each is named so the next person can check the box still
# contains what it claims to.
STAGES = {
    # The "WELCOME TO EAST ATLANTA" oval on the fence: the biggest single
    # object in the picture and identical in both plates.
    'eav': dict(night='eav', day='eav-day', ngf=0.88, nm=8.0,
                dgf=0.882, dm=7.81, mark=(645, 150, 1050, 430),
                what='WELCOME TO EAST ATLANTA oval', hold=None),
    # The bar's left window with OUR BAR ATL in it — a bright rectangle in a
    # dark brick wall, in both.
    'edgewood': dict(night='edgewood', day='edgewood-day', ngf=0.78, nm=7.0,
                     dgf=0.821, dm=7.70, mark=(48, 120, 340, 290),
                     what='OUR BAR ATL window', hold=None),
    # The CRIMINAL RECORDS fascia board.
    'l5p': dict(night='l5p', day='l5p-day', ngf=0.75, nm=9.0,
                dgf=0.730, dm=9.25, mark=(345, 15, 715, 150),
                what='CRIMINAL RECORDS sign board', hold=None),
    # The marquee arch. Day and night are DIFFERENT COMPOSITIONS here — the
    # arch sits higher in the day plate and the columns are further apart —
    # so a landmark match is expected to be poorer and the numbers want
    # reading with that in mind.
    'underground': dict(night='underground', day='underground-day',
                        ngf=0.78, nm=8.6, dgf=0.78, dm=8.6,
                        mark=(300, 150, 880, 560), what='marquee arch',
                        # DELIBERATELY LEFT AS IT IS. The suggested 0.751 is
                        # not trustworthy enough to act on and not worth the
                        # cost if it were: the match scores 0.315 against
                        # 0.50-0.57 for the others because these two are
                        # genuinely different compositions, the current values
                        # already put day within 1.5% of night, and this is
                        # the ONE day plate that is already cut into cards —
                        # nineteen of them, at 0.78. Moving the crop line
                        # invalidates that cut for a correction smaller than
                        # the error bar on the measurement.
                        hold='already cut at 0.78; match is weak (0.315)'),
    # The theatre's marquee block, front and centre in both plates. This pair
    # is GEOMETRY-MATCHED at source — the kerb sits at y≈788 in both — so day
    # groundFrac 0.770 and meters 9.0 are simply night's values, not a derived
    # correction; the row exists so the sweep still looks instead of assuming.
    'buckhead': dict(night='buckhead', day='buckhead-day', ngf=0.770, nm=9.0,
                     dgf=0.770, dm=9.0, mark=(560, 180, 980, 520),
                     what='Buckhead Theatre marquee',
                     hold='geometry-matched pair (kerb y≈788 both); '
                          'day 0.770/9.0 equals night by construction'),
}

SCALES = np.arange(0.60, 1.65, 0.005)


def gray(name):
    im = Image.open(os.path.join(BG, f'{name}.webp')).convert('L')
    return np.asarray(im).astype(np.uint8), im.size


def match(night, day, mark):
    """Best (scale, x, y, score) placing the night landmark in the day plate.

    Matched on a light Sobel magnitude rather than raw luminance: it keeps the
    structure (edges of signs, frames, letters) and discards the day/night
    difference in level, which is exactly the split wanted here.
    """
    ng, _ = gray(night)
    dg, _ = gray(day)

    def edges(a):
        gx = cv2.Sobel(a, cv2.CV_32F, 1, 0, ksize=3)
        gy = cv2.Sobel(a, cv2.CV_32F, 0, 1, ksize=3)
        m = cv2.magnitude(gx, gy)
        return cv2.normalize(m, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)

    ne, de = edges(ng), edges(dg)
    x0, y0, x1, y1 = mark
    tpl = ne[y0:y1, x0:x1]
    best = None
    for s in SCALES:
        th, tw = int(round(tpl.shape[0] * s)), int(round(tpl.shape[1] * s))
        if th < 12 or tw < 12 or th > de.shape[0] or tw > de.shape[1]:
            continue
        t = cv2.resize(tpl, (tw, th), interpolation=cv2.INTER_AREA)
        res = cv2.matchTemplate(de, t, cv2.TM_CCOEFF_NORMED)
        _, mx, _, loc = cv2.minMaxLoc(res)
        if best is None or mx > best[0]:
            best = (float(mx), float(s), int(loc[0]), int(loc[1]), tw, th)
    return best


def proof(stage, cfg, s, mx, my, tw, th):
    ni = Image.open(os.path.join(BG, f"{cfg['night']}.webp")).convert('RGB')
    di = Image.open(os.path.join(BG, f"{cfg['day']}.webp")).convert('RGB')
    n = np.asarray(ni).copy()
    d = np.asarray(di).copy()
    x0, y0, x1, y1 = cfg['mark']
    cv2.rectangle(n, (x0, y0), (x1, y1), (255, 0, 255), 3)
    cv2.rectangle(d, (mx, my), (mx + tw, my + th), (255, 0, 255), 3)
    pad = np.zeros((10, max(n.shape[1], d.shape[1]), 3), np.uint8)
    W = max(n.shape[1], d.shape[1])
    def wide(a):
        out = np.zeros((a.shape[0], W, 3), np.uint8)
        out[:, :a.shape[1]] = a
        return out
    stack = np.vstack([wide(n), pad, wide(d)])
    p = f'/tmp/{stage}_landmark.png'
    Image.fromarray(stack).save(p)
    print(f'    landmark proof -> {p}')


def main():
    want = [a for a in sys.argv[1:] if not a.startswith('--')]
    do_proof = '--proof' in sys.argv
    for stage in (want or list(STAGES)):
        c = STAGES[stage]
        _, (nw, nh) = gray(c['night'])
        _, (dw, dh) = gray(c['day'])
        got = match(c['night'], c['day'], c['mark'])
        if not got:
            print(f'{stage}: no match'); continue
        score, a, mx, my, tw, th = got

        # night_row -> day_row.  The landmark's top edge maps to the match's
        # top edge, which fixes the offset once the scale is known.
        b = my - a * c['mark'][1]
        ngrow = c['ngf'] * nh
        dgrow = a * ngrow + b
        dgf = dgrow / dh

        n_wpp = c['nm'] * WORLD_PER_M / (nh * c['ngf'])
        d_wpp = n_wpp / a
        dm = d_wpp * (dh * dgf) / WORLD_PER_M
        cur_wpp = c['dm'] * WORLD_PER_M / (dh * c['dgf'])

        drift = abs(dgf - c['dgf']) * dh
        print(f"{stage}   landmark: {c['what']}")
        print(f'    match score {score:.3f}   scale {a:.4f}   '
              f'day_row = {a:.4f} * night_row {b:+.1f}')
        print(f'    groundFrac  {c["dgf"]:.3f} (row {c["dgf"]*dh:.0f})  ->  '
              f'{dgf:.3f} (row {dgrow:.0f})   '
              f'{c["hold"] and "HELD: " + c["hold"] or ("ok" if drift < 8 else f"OFF BY {drift:.0f} ROWS")}')
        print(f'    meters      {c["dm"]:.2f}  ->  {dm:.2f}')
        print(f'    render vs night   was {cur_wpp/n_wpp*100-100:+.1f}%   '
              f'now {(dm*WORLD_PER_M/(dh*dgf))/n_wpp*100-100:+.1f}%')
        if do_proof:
            proof(stage, c, a, mx, my, tw, th)
        print()


if __name__ == '__main__':
    main()
