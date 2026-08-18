#!/usr/bin/env python3
"""
Grade every card cut in the game against the painting it was cut from.

WHY THIS EXISTS. Client: "the cutting is really bad... if we're cutting layers
of shit to be moving across each other, that has to be the most accurate shit
— almost as important as the registration dashboard." He is right, and up to
now every bad cut in this project was found the same way: he spotted it on his
phone, and it got fixed one at a time. The PEACHTREE crumb on the lamppost
card, the CITGO sign sliced by the fence, the grass card carrying the bottom
of every fence board. Three instances of one class of defect, found three
times by the client. This is that class, checked by machine, on every stage.

WHAT MAKES A CUT WRONG. A card boundary is supposed to run AROUND an object.
When it runs THROUGH one, the two halves end up on layers with different
parallax rates and shear apart as the player moves. Two signatures give it
away, and neither needs to know what the object is:

  FLATNESS — a real object's outline is irregular. A boundary that is a
  straight horizontal or vertical run for hundreds of columns was drawn with a
  ruler, not traced. EAV's `verge` scored 100% flat across 1285 columns and
  was slicing the fence and both light boxes in half.

  BOX FILL — how much of its own bounding box the mask actually covers. A
  traced object fills roughly half. A card that fills all of it is not a cut-
  out at all, it is a rectangle somebody dropped on the plate. EAV's
  `shrub_right` filled 100.0% on both variants at depth 0.85, the nearest
  layer on the stage: a box walking four straight edges across a shrub, a
  fence board and some tarmac.

  EDGE ALIGNMENT — a cut that follows a real boundary sits on a contrast
  ridge, because that is what a boundary IS: grass is green, fence is brown,
  and the line between them is visible. A cut through the middle of a surface
  crosses flat, low-contrast paint. So the plate's own gradient magnitude is
  sampled along each card's border and compared against the plate as a whole.
  A border sitting in quiet paint is a cut through content.

Neither is proof on its own — a card can legitimately end at the plate edge,
or butt against another card at the same depth where shear is impossible. Both
of those are excluded before scoring. What comes out is a ranked shortlist,
and the call on each one is still made by looking at the plate.

⚠️ ONLY CUTS THAT CAN ACTUALLY SHEAR ARE SCORED. A boundary between two cards
at the same depth is unobservable however badly it was drawn — that is exactly
why pinning a card to BASE_DEPTH fixes these without redrawing anything. The
depth each card sits at is read from stages.js, not guessed.

Usage:
    python3 tools/cut_audit.py                # every stage, both variants
    python3 tools/cut_audit.py eav-day        # one
"""

import math
import os
import re
import sys

import numpy as np
import scipy.ndimage as ndi
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BG = os.path.join(ROOT, 'src', 'assets', 'backgrounds')
SRC = open(os.path.join(ROOT, 'src', 'world', 'stages.js')).read()

BASE_DEPTH = 0.5
# Mirrors cardParallax in src/render/backdrop.js. If those change, change these
# — a tool that models a dead parallax law grades its own memory.
DEPTH_SPREAD = 0.010
MAX_SEPARATION = 16
CAM_END = 9000          # camera.x * zoom near the end of a stage
# Below this, a card travels with the base and its cut cannot be seen.
SHEAR_MIN = 0.03
# Shear in px, at the far end of a stage, below which a bad cut is not worth
# chasing. Three pixels of slide on a 430px phone is under a pixel once the
# viewport scale is applied, and every card measured under this threshold has
# come back invisible when actually rendered and diffed.
NEGLIGIBLE_PX = 4.0
# ⚠️ A DELIBERATE FEATHER IS A DEEP RAMP, NOT A SOFT PIXEL. cut_planes.py
# gives many cards a sub-pixel Gaussian edge, and a first attempt at this check
# read "mean alpha below solid" and duly declared eight cards feathered that
# nobody had touched. One blurred pixel still reads as a line. So the test is
# how many ROWS it takes the alpha to climb back to solid going up from the
# edge: an antialiased cut gets there in one or two, a real ramp takes many.
# tools/feather_flat_edge.py writes an 18-row ramp.
FEATHER_ROWS = 6
FEATHER_SOLID = 200
# A straight run this long is a ruler.
FLAT_RUN = 40

STAGES = ['eav', 'eav-day', 'edgewood', 'edgewood-day',
          'underground', 'underground-day', 'l5p', 'l5p-day']

# ⚠️ FLAGGED BY METRIC, CLEARED BY EYE. A number can say a cut is bad; only a
# rendered frame can say a player would notice. Anything in here scored badly
# and was then driven in the game, at a camera position where the card is
# actually on screen, with its depth toggled against BASE_DEPTH and the frames
# diffed. Recorded so the next sweep does not spend an afternoon re-proving it.
#
# If a plate is ever re-cut, DELETE its entry — the verification was of that
# cut, not of that card's name.
VERIFIED_OK = {
    # Every entry below was driven with tools/harness/cutcheck.mjs, which walks
    # the stage, finds the camera stop where the card is most on-screen, and
    # renders the frame three times — at the card's depth, at BASE_DEPTH, and
    # at its depth again. The third shot is the control: the game keeps
    # animating between captures, and without it the noise floor sat at 6-20%
    # and buried everything. With the camera allowed to settle first it drops
    # to 2-3%, and the number below is signal minus that noise.
    #
    # Every one of these came back as the card parallaxing and nothing else.
    # No tear, no hard line, no object cut in half — checked by eye on the
    # frames the sweep saved, not just by the number.
    ('edgewood-day', 'skyline'):  'flat top at y=34, but almost all of that run is against open '
                                  'sky. 10.3% differs between 0.05 and 0.50 at 91m, all of it the '
                                  'card moving; buildings whole. A far skyline is the most valuable '
                                  'slow parallax on the stage.',
    ('edgewood', 'skyline'):      'net 3.6% over noise at x=9200. Shopfronts and neon continuous.',
    ('edgewood', 'lamps'):        'net 2.8% over noise at x=3200. No line at the cut.',
    ('edgewood-day', 'parapet'):  'net 2.2% over noise at x=3200. Brick reads continuous.',
    ('edgewood-day', 'trees'):    'net 1.6% over noise at x=900.',
    ('eav-day', 'pole'):          'net 2.1% over noise at x=2000. Foliage and fence continuous.',
    ('eav', 'pole'):              'net 1.5% over noise at x=6800.',
    ('eav-day', 'cars'):          'net 1.5% over noise at x=4400.',
    ('eav-day', 'skyline'):       'net 1.7% over noise at x=5600.',
    ('eav', 'skyline'):           'net 1.8% over noise at x=5600.',
}


def cards(stage):
    parent = stage[:-4] if stage.endswith('-day') else stage
    i = SRC.index(f"id: '{parent}'")
    if stage.endswith('-day'):
        i = SRC.index('day: {', i)
    j = SRC.index('cards: [', i)
    k = j + len('cards: [')
    d = 1
    while d:
        if SRC[k] == '[':
            d += 1
        elif SRC[k] == ']':
            d -= 1
        k += 1
    return [(m.group(1), float(m.group(2)))
            for m in re.finditer(r"key: '(\w+)'.*?depth: ([\d.]+)", SRC[j:k], re.S)]


def ramp_depth(alpha, mask, line, tol=4):
    """Rows it takes the alpha to climb back to solid, going up from the edge.

    One or two rows is an antialiased cut and still shows as a line. Many rows
    is a deliberate ramp with no line in it at all.
    """
    H, W = mask.shape
    ys = np.arange(H)[:, None]
    low = (mask * ys).max(0)
    cols = [x for x in np.where(mask.any(0))[0]
            if abs(int(low[x]) - line) <= tol]
    if not cols:
        return 0.0
    depths = []
    for x in cols[::3]:
        b = int(low[x])
        d = 0
        for k in range(24):
            y = b - k
            if y < 0 or alpha[y, x] >= FEATHER_SOLID:
                break
            d += 1
        depths.append(d)
    return float(np.median(depths)) if depths else 0.0


def longest_flat_fraction(mask):
    """How much of this card's top and bottom edge lies on a straight run."""
    H, W = mask.shape
    cols = np.where(mask.any(0))[0]
    if len(cols) < FLAT_RUN:
        return 0.0, None
    top = mask.argmax(0)[cols]
    ys = np.arange(H)[:, None]
    bot = (mask * ys).max(0)[cols]
    worst, which = 0.0, None
    for name, line in (('top', top), ('bottom', bot)):
        # Fraction of columns sharing the single most common row.
        vals, counts = np.unique(line, return_counts=True)
        row = int(vals[counts.argmax()])
        # ⚠️ THE PLATE'S OWN EDGE IS NOT A CUT. A card that reaches the top or
        # the bottom of the painting is flat there because the painting stops,
        # not because anyone drew a line. Scoring those put four cards at the
        # head of the list on their first run — every one of them a skyline or
        # a backdrop legitimately running to y=0.
        if row <= 1 or row >= H - 2:
            continue
        frac = counts.max() / len(line)
        if counts.max() >= FLAT_RUN and frac > worst:
            worst, which = float(frac), f'{name} y={row}'
    return worst, which


def main():
    todo = sys.argv[1:] or STAGES
    findings = []
    for stage in todo:
        try:
            cs = cards(stage)
        except ValueError:
            print(f'{stage}: not in stages.js')
            continue
        plate = os.path.join(BG, f'{stage}.webp')
        if not os.path.exists(plate):
            continue
        g = np.array(Image.open(plate).convert('L')).astype(np.float32)
        grad = np.hypot(ndi.sobel(g, 0), ndi.sobel(g, 1))
        # What "an edge" means on THIS plate, rather than an absolute number —
        # a soft painterly stage and a crisp one are not comparable.
        ridge = float(np.percentile(grad, 75))

        for key, depth in cs:
            p = os.path.join(BG, f'{stage}-{key}.webp')
            if not os.path.exists(p):
                continue
            shear = abs(depth - BASE_DEPTH)
            if shear < SHEAR_MIN:
                continue                    # pinned: its cut cannot be seen
            raw = np.array(Image.open(p).convert('RGBA'))[..., 3]
            m = raw > 24
            if m.sum() < 400:
                continue
            flat, where = longest_flat_fraction(m)
            # A ramped edge is not a line, whatever the binary mask says.
            soft = False
            if where and where.startswith('bottom'):
                line = int(where.split('y=')[1])
                soft = ramp_depth(raw, m, line) >= FEATHER_ROWS
            shear_px = MAX_SEPARATION * math.tanh(
                CAM_END * (depth - BASE_DEPTH) * DEPTH_SPREAD / MAX_SEPARATION)
            ys_, xs_ = np.where(m)
            box = ((xs_.max() - xs_.min() + 1) * (ys_.max() - ys_.min() + 1))
            boxfill = float(m.sum() / box)

            # Border pixels, minus anything on the plate's own outer frame.
            border = m ^ ndi.binary_erosion(m, np.ones((3, 3), bool))
            border[0, :] = border[-1, :] = False
            border[:, 0] = border[:, -1] = False
            n = int(border.sum())
            if n < 200:
                continue
            align = float((grad[border] > ridge).mean())
            # Rank a rectangle as at least as bad as a ruler cut — it is one,
            # on all four sides at once.
            findings.append((max(flat, boxfill if boxfill > 0.85 else 0.0),
                             1.0 - align, stage, key, depth, where, n, align,
                             flat, boxfill, abs(shear_px), soft))

    print('CARD CUTS THAT CAN SHEAR, WORST FIRST')
    print('  flat  = share of the edge lying on one straight row (ruler marks)')
    print('  box   = share of its bounding box the mask fills (100% = a rectangle)')
    print('  onedge= share of the border sitting on real contrast in the plate')
    print('  slide = px the card travels against the base by the end of a stage')
    print()
    for _, _, stage, key, depth, where, n, align, flat, boxfill, shear_px, soft in \
            sorted(findings, reverse=True):
        if (stage, key) in VERIFIED_OK:
            flag = '  (checked in a rendered frame — no tear)'
        elif shear_px < NEGLIGIBLE_PX:
            flag = f'  (slides {shear_px:.1f}px — below seeing)'
        elif soft:
            flag = '  (edge feathered — no line to see)'
        elif boxfill > 0.985:
            flag = '  <== NOT A CUT-OUT, A RECTANGLE'
        elif flat >= 0.5:
            flag = '  <== RULER CUT'
        elif align < 0.35 and flat >= 0.25:
            flag = '  <== straight-ish cut through flat paint'
        else:
            flag = ''
        print(f'  {stage:16s} {key:12s} d={depth:<5} '
              f'flat={flat*100:5.1f}% box={boxfill*100:5.1f}% slide={shear_px:5.1f}px '
              f'{("("+where+")") if where else "":18s} '
              f'onedge={align*100:5.1f}%{flag}')
    # ⚠️ COUNT THE FLAGGED, NOT THE LISTED. Every card that can shear appears
    # in the table; only some of them carry a warning. A first version counted
    # rows and announced "37 cuts still worth a look" when the real number was
    # zero, which is the kind of summary that gets a tool ignored.
    def flagged(f):
        _, _, stage, key, _, _, _, align, flat, boxfill, shear_px, soft = f
        if (stage, key) in VERIFIED_OK or soft or shear_px < NEGLIGIBLE_PX:
            return False
        # ⚠️ LOW EDGE-CONTRAST ALONE IS NOT EVIDENCE. Clouds score 0.2% because
        # clouds have no edges; hazy far buildings and foliage are barely
        # better. Judging on that number by itself flagged eighteen cards, most
        # of them objects that are soft by nature and cut perfectly well. A cut
        # through flat paint only matters when it is also a LINE, so the two
        # signals have to agree.
        return boxfill > 0.985 or flat >= 0.5 or (align < 0.35 and flat >= 0.25)
    live = [f for f in findings if flagged(f)]
    print()
    if live:
        print(f'{len(live)} cut(s) still worth a look. A cut is only a problem '
              'if it runs THROUGH an object — check the plate before changing\n'
              'anything, and remember the cheap fix is usually depth 0.50 '
              'rather than a re-cut: at base depth the seam cannot be seen.')
    else:
        print('Nothing outstanding. Every flagged cut is either pinned to base '
              'depth, feathered, sliding less than a pixel the player could\n'
              'see, or checked in a rendered frame and cleared. Re-run after '
              'any re-cut, and delete that plate\'s VERIFIED_OK entries first.')
    for stage, key in sorted(VERIFIED_OK):
        print(f'\n  cleared by eye — {stage} {key}:\n    '
              + VERIFIED_OK[(stage, key)].replace('. ', '.\n    '))


if __name__ == '__main__':
    main()
