#!/usr/bin/env python3
"""
Which cards slide across something that must not be slid across?

THE FAULT THIS FINDS. The base plate keeps a full copy of everything a card
redraws, so a card offset N px prints its content twice, N px apart. Where the
card is a big opaque object DRAWN ON TOP of something else, the second copy is
not a faint ghost — it is a hard occlusion boundary that crawls. The client
caught it on EAV: "the CITGO sign, you got it cut with the fence and it's
moving. It shouldn't be cut at all."

OVERLAP ALONE IS NOT THE BUG, and a tool that just lists overlaps cries wolf
on most of the stage. A tree in front of a distant sign SHOULD slide against
it — that is the whole effect. Three conditions have to hold together:

  1. the two cards actually share opaque pixels (not just bounding boxes),
  2. the mover is drawn AFTER the other one, so it is the one occluding,
  3. they are not genuinely at different distances in the painting.

(3) is the judgement call and no tool can make it. What this prints is the
shortlist, ranked, with the separation each pair will reach — so the call gets
made against numbers instead of against a memory of the plate.

WHAT THE ANSWER USUALLY IS. If two things are physically at the same distance
— a sign MOUNTED ON a fence, lettering painted ON a wall — they belong at the
same depth, and BASE_DEPTH (0.50) is the one value at which a card cannot
ghost at all. Every lettering card in this game sits there for that reason.
If they really are at different distances, leave it: that pair is the effect
working.

Usage:
    python3 tools/card_overlaps.py                 # every stage, both variants
    python3 tools/card_overlaps.py eav-day         # one
"""

import math
import os
import re
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BG = os.path.join(ROOT, 'src', 'assets', 'backgrounds')
SRC = open(os.path.join(ROOT, 'src', 'world', 'stages.js')).read()

BASE_DEPTH = 0.5
DEPTH_SPREAD = 0.010
MAX_SEPARATION = 16
# Roughly the far end of a stage. The backdrop travels ~743px over a whole
# stage but camX here is camera.x * zoom, which is the number cardParallax
# actually receives.
CAM_END = 9000

STAGES = ['eav', 'eav-day', 'edgewood', 'edgewood-day',
          'underground', 'underground-day', 'l5p', 'l5p-day']


def cards(stage):
    """(key, depth) in DRAW ORDER — the order is the occlusion order."""
    parent = stage[:-4] if stage.endswith('-day') else stage
    i = SRC.index(f"id: '{parent}'")
    if stage.endswith('-day'):
        i = SRC.index('day: {', i)
    j = SRC.index('cards: [', i)
    k = j + len('cards: [')
    depth = 1
    while depth:
        if SRC[k] == '[':
            depth += 1
        elif SRC[k] == ']':
            depth -= 1
        k += 1
    return [(m.group(1), float(m.group(2)))
            for m in re.finditer(r"key: '(\w+)'.*?depth: ([\d.]+)", SRC[j:k], re.S)]


def separation(depth, cam=CAM_END):
    """Mirror of cardParallax in render/backdrop.js, minus the common term."""
    diff = cam * (depth - BASE_DEPTH) * DEPTH_SPREAD
    return MAX_SEPARATION * math.tanh(diff / MAX_SEPARATION)


def report(stage):
    cs = cards(stage)
    masks = {}
    for key, _ in cs:
        path = os.path.join(BG, f'{stage}-{key}.webp')
        if os.path.exists(path):
            masks[key] = np.array(Image.open(path).convert('RGBA'))[..., 3] > 8

    order = {key: i for i, (key, _) in enumerate(cs)}
    hits = []
    for over, d_over in cs:
        if over not in masks:
            continue
        sep = separation(d_over)
        if abs(sep) < 3:
            continue                      # cannot crawl far enough to see
        for under, d_under in cs:
            if under == over or under not in masks:
                continue
            if order[under] > order[over]:
                continue                  # `under` is on top; not this pair
            rel = sep - separation(d_under)
            if abs(rel) < 3:
                continue                  # they travel together
            shared = int((masks[over] & masks[under]).sum())
            if shared >= 200:
                hits.append((abs(rel) * shared, over, d_over, under, rel, shared))

    print(f'\n{stage}')
    if not hits:
        print('   nothing on top of anything it can crawl across')
        return
    for _, over, d_over, under, rel, shared in sorted(hits, reverse=True):
        print(f'   {over:12s} d={d_over:<5} drawn OVER {under:12s} '
              f'sharing {shared:6d}px, crawling {rel:+6.1f}px')


def main():
    for stage in (sys.argv[1:] or STAGES):
        try:
            report(stage)
        except ValueError:
            print(f'\n{stage}: no such stage in stages.js')
    print('\nJudge each pair against the painting: same distance -> same depth '
          '(0.50). Genuinely nearer -> leave it, that pair is the effect.')


if __name__ == '__main__':
    main()
