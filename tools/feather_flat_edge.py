#!/usr/bin/env python3
"""
Soften a card's ruler-straight edge instead of freezing the whole card.

THE PROBLEM THIS SOLVES, AND WHY IT IS NOT JUST "USE BASE DEPTH". Several
cards were cut with a straight horizontal line through content that continues
past it — tools/cut_audit.py ranks them. Pinning such a card to BASE_DEPTH
makes the bad cut unobservable and has been the right answer three times: for
a ground strip, for a co-planar fence, for a card that was a plain rectangle.
It works because none of those had parallax worth keeping.

EAV's `tree` does. It is the big near foliage mass down the left of the stage
at depth 0.81, and it is one of the few things on that plate genuinely closer
than the fence. Freezing it costs a real depth cue.

What is actually visible is not the card's motion — it is the HARD LINE at the
bottom of it. Measured at the start of the stage, 0.81 against 0.50 differs
over 6.8% of the frame, and the difference reads as the hedge terminating in a
straight edge above the kerb with the grass cut off beneath it.

So: keep the depth, kill the line. The card's alpha is ramped to zero over the
last N rows of its flat run, so instead of foliage stopping dead it fades into
the base's own copy of the same foliage. Two near-identical images blended
across 18px read as soft undergrowth; a hard edge sliding 15px reads as a
mistake.

⚠️ ONLY WHERE THE EDGE IS ACTUALLY FLAT. A column whose content ends well
above the ruler line is a real silhouette — a trunk, a gap between shrubs —
and feathering it would eat the object's own outline. Columns are ramped only
if they bottom out within `tol` of the flat run, which is the same test the
audit uses to find the run in the first place.

⚠️ THIS ONLY REMOVES ALPHA. The base holds a full copy of everything a card
draws, so softening a card can never leave a hole — the pixels the card gives
up are still painted, at the base's rate. Same safety argument as
drop_card_crumbs.py.

Usage:
    python3 tools/feather_flat_edge.py eav-day tree --preview
    python3 tools/feather_flat_edge.py eav-day tree
"""

import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BG = os.path.join(ROOT, 'src', 'assets', 'backgrounds')

# depth of the ramp in px, and how close to the flat line a column must bottom
# out to be treated as part of it.
EDGES = {
    'tree': dict(side='bottom', ramp=18, tol=4,
                 why='hedge cut dead flat at the grass line'),
}


def main():
    stage, key = sys.argv[1], sys.argv[2]
    preview = '--preview' in sys.argv
    if key not in EDGES:
        raise SystemExit(f'no edge entry for {key!r}. Known: '
                         f'{", ".join(sorted(EDGES))}')
    cfg = EDGES[key]
    path = os.path.join(BG, f'{stage}-{key}.webp')
    if not os.path.exists(path):
        raise SystemExit(f'missing {path}')

    a = np.array(Image.open(path).convert('RGBA'))
    alpha = a[..., 3].astype(np.float32)
    solid = alpha > 24
    H, W = solid.shape
    ys = np.arange(H)[:, None]
    cols = np.where(solid.any(0))[0]
    if cfg['side'] != 'bottom':
        raise SystemExit('only bottom edges are implemented')
    low = (solid * ys).max(0)
    line = int(np.bincount(low[cols]).argmax())
    run = [x for x in cols if abs(int(low[x]) - line) <= cfg['tol']]
    print(f'{stage}-{key}: flat bottom at y={line} on '
          f'{len(run)}/{len(cols)} columns  ({cfg["why"]})')
    if not run:
        print('  nothing flat enough to feather')
        return

    ramp = cfg['ramp']
    touched = 0
    for x in run:
        b = int(low[x])
        for k in range(ramp):
            y = b - k
            if y < 0 or not solid[y, x]:
                continue
            # 0 at the very edge, 1 by the top of the ramp.
            f = (k + 1) / (ramp + 1)
            new = alpha[y, x] * f
            if new < alpha[y, x]:
                alpha[y, x] = new
                touched += 1
    print(f'  ramped {touched} px over the last {ramp} rows')
    if preview:
        print('  --preview: nothing written')
        return
    a[..., 3] = np.clip(alpha, 0, 255).astype(np.uint8)
    a[a[..., 3] == 0] = 0
    # 94 to match cut_planes.py.
    Image.fromarray(a, 'RGBA').save(path, 'WEBP', quality=94, method=6)
    print(f'  -> {os.path.relpath(path, ROOT)}')


if __name__ == '__main__':
    main()
