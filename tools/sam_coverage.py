#!/usr/bin/env python3
"""
Check a SAM pass against the ORIGINAL plate: what did it miss?

Looking at the proposal sheet only ever shows what SAM FOUND. The thing that
matters for this project is what it did not — the C and the I in CRIMINAL, the
large C and R on the Criminal Records sign, all of which a grid-28 pass walked
straight past. This renders the complement: every pixel no mask claims, over
the art, so the gaps are the thing you are looking at instead of the hits.

Unclaimed is not automatically wrong. Sky is unclaimed and should be, and so
is flat wall. What matters is unclaimed pixels that carry DETAIL — so gaps are
scored by local contrast, and the report ranks the ones with real structure in
them.

Usage:
    python3 tools/sam_coverage.py l5p
"""

import json
import os
import sys

import numpy as np
import scipy.ndimage as ndi
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BG = os.path.join(ROOT, 'src', 'assets', 'backgrounds')
SAM = os.path.join(ROOT, 'tools', 'captures', 'sam')

# ⚠️ THE CROP COMES FROM sam_segment, IT IS NOT COPIED HERE. This file used to
# carry its own four-stage table with underground at 0.78 — the fraction that
# belonged to the old 1122x1402 portrait painting, two plates ago. So the check
# that exists to catch what the segmenter missed would have graded a DIFFERENT
# crop than the segmenter read, reported phantom gaps along one edge and real
# ones off the other, and had nothing at all to say about any of the four
# daytime plates because they were never added to it.
#
# A verification tool holding its own copy of the thing it verifies against
# grades its own memory. Same class of bug as preview_planes.py drifting a
# generation behind the renderer's parallax law. One table, in the tool that
# does the cutting.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sam_segment import GROUND_FRAC, load_plate     # noqa: E402


def main():
    stage = sys.argv[1]
    if stage not in GROUND_FRAC:
        raise SystemExit(f'no crop known for {stage!r} — add it to '
                         f'GROUND_FRAC in tools/sam_segment.py. Known: '
                         f'{", ".join(sorted(GROUND_FRAC))}')
    rgb = load_plate(stage)
    H, W = rgb.shape[:2]
    im = Image.fromarray(rgb)

    M = np.load(os.path.join(SAM, f'{stage}_masks.npy'))
    claimed = M.any(0) if len(M) else np.zeros((H, W), bool)
    print(f'{stage}: {len(M)} masks cover {claimed.mean() * 100:.1f}% of the plate')

    # Local contrast — the detail signal. A pixel in flat sky has none; a
    # pixel on the edge of a letter has a lot.
    g = rgb.astype(np.float32).mean(2)
    detail = ndi.maximum_filter(g, 5) - ndi.minimum_filter(g, 5)
    thresh = float(np.percentile(detail, 88))
    missed = (~claimed) & (detail > thresh)
    print(f'  unclaimed AND detailed: {missed.sum()} px '
          f'({missed.sum() * 100.0 / (W * H):.2f}% of plate) '
          f'at contrast > {thresh:.0f}')

    lab, n = ndi.label(ndi.binary_closing(missed, np.ones((5, 5), bool)),
                       np.ones((3, 3), bool))
    sizes = np.bincount(lab.ravel())
    sizes[0] = 0
    objs = ndi.find_objects(lab)
    big = [i for i in np.argsort(sizes)[::-1] if sizes[i] >= 150]
    print(f'  {len(big)} missed regions of 150px or more:')
    for i in big[:20]:
        ys, xs = objs[i - 1]
        print(f'     {int(sizes[i]):6d}px  x {xs.start:4d}..{xs.stop:4d}  '
              f'y {ys.start:4d}..{ys.stop:4d}')

    out = (rgb * 0.30).astype(np.uint8).copy()
    out[claimed] = (out[claimed] * 0.55 + np.array((40, 90, 40)) * 0.45).astype(np.uint8)
    out[missed] = (255, 40, 40)
    img = Image.fromarray(out)
    d = ImageDraw.Draw(img)
    for i in big[:20]:
        ys, xs = objs[i - 1]
        d.rectangle([xs.start - 1, ys.start - 1, xs.stop, ys.stop],
                    outline=(255, 255, 0))
    img.save(os.path.join(SAM, f'{stage}_missed.png'))
    print(f'  -> {stage}_missed.png  (RED = unclaimed detail, green tint = claimed)')


if __name__ == '__main__':
    main()
