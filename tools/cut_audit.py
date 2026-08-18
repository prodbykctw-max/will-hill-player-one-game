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
# Below this, a card travels with the base and its cut cannot be seen.
SHEAR_MIN = 0.03
# A straight run this long is a ruler.
FLAT_RUN = 40

STAGES = ['eav', 'eav-day', 'edgewood', 'edgewood-day',
          'underground', 'underground-day', 'l5p', 'l5p-day']


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
            m = np.array(Image.open(p).convert('RGBA'))[..., 3] > 24
            if m.sum() < 400:
                continue
            flat, where = longest_flat_fraction(m)
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
                             flat, boxfill))

    print('CARD CUTS THAT CAN SHEAR, WORST FIRST')
    print('  flat  = share of the edge lying on one straight row (ruler marks)')
    print('  box   = share of its bounding box the mask fills (100% = a rectangle)')
    print('  onedge= share of the border sitting on real contrast in the plate')
    print()
    for _, _, stage, key, depth, where, n, align, flat, boxfill in sorted(findings, reverse=True):
        flag = ''
        if boxfill > 0.985:
            flag = '  <== NOT A CUT-OUT, A RECTANGLE'
        elif flat >= 0.5:
            flag = '  <== RULER CUT'
        elif align < 0.35:
            flag = '  <== cuts through flat paint'
        print(f'  {stage:16s} {key:12s} d={depth:<5} '
              f'flat={flat*100:5.1f}% box={boxfill*100:5.1f}% '
              f'{("("+where+")") if where else "":18s} '
              f'onedge={align*100:5.1f}% of {n:6d}px{flag}')
    print('\nA cut is only a problem if it runs THROUGH an object. Check each '
          'flagged card against the plate before changing anything —\n'
          'and remember the cheap fix is usually depth 0.50, not a re-cut: at '
          'base depth the seam cannot be observed at all.')


if __name__ == '__main__':
    main()
