#!/usr/bin/env python3
"""Cut the DAY plates with the NIGHT plates' own shapes.

The client, after playing: *"a whole bunch of daytime errors on the scenery...
make sure that besides the time of day these images are damn identical."*

WHY THEY WERE NOT. The two halves of a stage were cut by different methods and
at different times. EAV's night cards come from hand-drawn ROI polygons plus
colour keying (`tools/sam_masks/eav/` holds exactly one mask, clouds); its day
cards come from ten frozen SAM masks. Same scene, same framing, two unrelated
pipelines — so the day cut lost `shrub_right` altogether and tore vertical
slots through the fence where nothing was drawn back, and Edgewood's day
`parapet` mask caught 5% of a roofline that runs the width of the building.
Measured: night scores ZERO full-height hard columns at every sample point on
all four stages; eav-day scores 10 and 8 in its back half.

WHAT THIS DOES. Not a better day cut — the SAME cut. `<stage>-planes.json`
stores the final traced contours of every night card, so those get rasterised
back into masks, mapped into day-plate pixel space, and handed to
`cut_planes.cut()` as frozen masks. The day cards then have the night cards'
names, shapes and count by construction, and only the pixels underneath
differ.

THE MAPPING is the landmark match already built for the day framing work
(`check_day_framing.match`): a night landmark template, Sobel edges so the
day/night level difference drops out, swept over scale. It returns where that
landmark lands in the day plate, which is a uniform scale plus a translation —
and that is the whole transform, because both plates frame the same street.

UNDERGROUND IS DELIBERATELY EXCLUDED. Its day and night are genuinely
different compositions — the arch sits higher and the columns are further
apart — which is why its landmark scores 0.315 against 0.50-0.57 for the
others, and why it got its own pass in the first place. Forcing night shapes
onto it would import errors rather than remove them. It is also the only day
plate the measurement does not fault in open ground: 4 hard columns at the
very start and zero everywhere after.

Usage:
    python3 tools/mirror_day_cut.py --plan
    python3 tools/mirror_day_cut.py --write
"""

import argparse
import json
import os
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
BG = ROOT / 'src' / 'assets' / 'backgrounds'
SAM = ROOT / 'tools' / 'sam_masks'

sys.path.insert(0, str(ROOT / 'tools'))

# eav, edgewood and l5p only. See the note on Underground above.
MIRROR = ['eav', 'edgewood', 'l5p']

# NOT EVERYTHING SHOULD BE MIRRORED. Two kinds of card are legitimately
# different between the halves and taking the night shape would be the error,
# not the fix:
#   clouds - the sky is a different painting at noon than at midnight, and
#            cutting day pixels in the shape of night clouds would slice
#            through the middle of the day ones.
#   trees  - Edgewood's day trees exist because the client asked for them
#            ("isolate the trees and the building separately"); night has no
#            such card to mirror.
# Anything already in the day mask folder and not in this list gets replaced.
KEEP_DAY_OWN = {'clouds', 'trees'}


def rasterize_contours(contours, w, h):
    """Contours back to a filled mask. `trace_contours` wrote them, so this is
    its inverse and the shape survives the round trip."""
    import cv2
    m = np.zeros((h, w), np.uint8)
    polys = [np.asarray(c, np.int32).reshape(-1, 1, 2) for c in contours if len(c) >= 3]
    if polys:
        cv2.fillPoly(m, polys, 1)
    return m.astype(bool)


def transform(night_mask, s, dx, dy, x0, y0, out_w, out_h):
    """Night pixel space -> day pixel space: uniform scale about the landmark
    origin, then translate to where the landmark actually landed."""
    import cv2
    h, w = night_mask.shape
    M = np.array([[s, 0.0, dx - s * x0],
                  [0.0, s, dy - s * y0]], np.float32)
    out = cv2.warpAffine(night_mask.astype(np.uint8), M, (out_w, out_h),
                         flags=cv2.INTER_NEAREST, borderValue=0)
    return out.astype(bool)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--plan', action='store_true')
    ap.add_argument('--write', action='store_true')
    ap.add_argument('--only', action='append')
    ap.add_argument('--cut', action='store_true',
                    help='after writing masks, run cut_planes on the day plates')
    args = ap.parse_args()
    if not (args.plan or args.write):
        ap.error('give --plan or --write')

    import check_day_framing as cdf

    plan = {}
    for stage in (args.only or MIRROR):
        cfg = cdf.STAGES[stage]
        night_id, day_id = cfg['night'], cfg['day']
        npl = json.load(open(BG / f'{night_id}-planes.json'))
        nw, nh = npl['source']
        day = Image.open(BG / f'{day_id}.webp')
        dw, dh = day.size

        score, s, dx, dy, tw, th = cdf.match(night_id, day_id, cfg['mark'])
        x0, y0 = cfg['mark'][0], cfg['mark'][1]
        print(f'\n=== {stage}  night {nw}x{nh} -> day {dw}x{dh} ===')
        print(f'  landmark "{cfg["what"]}" matched {score:.3f}, scale {s:.3f}, '
              f'offset ({dx}, {dy})')
        if score < 0.40:
            print(f'  REFUSED: match too weak to map shapes with. Skipping {stage}.')
            continue

        out_dir = SAM / f'{day_id}'
        rows = []
        kept_own = []
        for name, it in npl['items'].items():
            if name in KEEP_DAY_OWN:
                kept_own.append(name)
                continue
            m = rasterize_contours(it['contours'], nw, nh)
            d = transform(m, s, dx, dy, x0, y0, dw, dh)
            keep = int(d.sum())
            frac = keep / max(int(m.sum()), 1)
            rows.append((name, int(m.sum()), keep, frac))
            if args.write and keep > 0:
                out_dir.mkdir(parents=True, exist_ok=True)
                Image.fromarray((d * 255).astype(np.uint8)).convert('1').save(
                    out_dir / f'{name}.png')
        existing = {q.stem for q in out_dir.glob('*.png')} if out_dir.exists() else set()
        day_only = sorted((existing & KEEP_DAY_OWN) | set(kept_own))
        for name, a, b, f in rows:
            flag = '' if f > 0.55 else '   <-- mostly outside the day frame'
            print(f'  {name:14s} {a:8d} px -> {b:8d} px  ({f * 100:5.1f}% kept){flag}')
        if day_only:
            print(f'  kept the day plate\'s own: {", ".join(day_only)}')
        plan[stage] = {'day_id': day_id, 'mirrored': [r[0] for r in rows],
                       'day_own': day_only, 'names': [r[0] for r in rows] + day_only,
                       'score': round(score, 3), 'scale': round(s, 4)}

    if args.write:
        json.dump(plan, open(ROOT / 'tools' / 'mirror_plan.json', 'w'), indent=1)
        print(f'\nmasks written for: {", ".join(plan)}')

    if args.cut:
        # Called directly rather than through PLANES: the item list IS the
        # night order, which is the depth order, and duplicating it into the
        # plane table by hand is how the two halves drifted apart in the first
        # place. Every item is mask-driven, so build_masks skips the ROI and
        # sky-key path entirely and post_process only tidies.
        import cut_planes
        for stage, info in plan.items():
            npl = json.load(open(BG / f'{cut_planes.PLANES and stage}-planes.json'))
            order = list(npl['items'].keys())
            for extra in info['day_own']:
                if extra not in order:
                    order.insert(order.index('skyline') + 1 if 'skyline' in order else 0, extra)
            have = {q.stem for q in (SAM / info['day_id']).glob('*.png')}
            items = [{'name': n, 'mask': n} for n in order if n in have]
            print(f"\n--- cutting {info['day_id']} with {len(items)} mirrored masks ---")
            cut_planes.cut(info['day_id'], items)


if __name__ == '__main__':
    main()
