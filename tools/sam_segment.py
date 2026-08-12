#!/usr/bin/env python3
"""
Outline every item in a backdrop with Segment Anything, and rank the masks by
how usable each one is as a parallax card.

WHY THIS EXISTS. cut_planes.py finds an item's EDGE beautifully — the sky
flood-fill lands on every silhouette at once, per pixel — but it has to be
TOLD where each item is, as a hand-authored ROI. Authoring those by reading
coordinates off zoomed screenshots is slow and it is where the mistakes come
from. SAM does the finding: it is class-agnostic, so it never needs to know
what a "Citgo canopy" or a "marquee arch" is, it just returns a mask per
coherent region.

WHAT IT DOES NOT DO. SAM has no idea about depth. It will happily return two
hundred masks — every window, every plank, every bulb — and something still
has to say "that one is the tree, it belongs at 0.81". So this writes a
proposal sheet for a human to read, not a finished plane set.

Usage:
    python3 tools/sam_segment.py underground             # propose masks
    python3 tools/sam_segment.py underground --grid 40   # denser sampling
    python3 tools/sam_segment.py underground --coarse    # skip the letters
"""

import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BG = os.path.join(ROOT, 'src', 'assets', 'backgrounds')
OUT = os.path.join(ROOT, 'tools', 'captures', 'sam')
CKPT = '/root/sam/sam_vit_b.pth'

# groundFrac per stage — must match src/world/stages.js, since the cards are
# cut from the same crop the renderer draws.
GROUND_FRAC = {'eav': 0.88, 'underground': 0.78, 'l5p': 0.80, 'edgewood': 0.82,
               # DAYTIME PLATES. Same scenes, so the same ground fractions —
               # except Five Points, whose day composition sits the arch
               # higher and shows more plaza (see stages.js).
               'underground-day': 0.78, 'eav-day': 0.88,
               'edgewood-day': 0.82, 'l5p-day': 0.80,
               # TITLE SCREEN. Not a stage — there is no ground line to crop
               # to, and the parallax wants the whole picture including the
               # wet road at the bottom, so this one is 1.0.
               'title': 1.0,
               # ENDING SCREEN. Also not a stage — the whole frame is the
               # picture, crowd to ceiling, so nothing is cropped off.
               'ending': 1.0}


def load_plate(stage):
    im = Image.open(os.path.join(BG, f'{stage}.webp')).convert('RGB')
    w, h = im.size
    return np.array(im.crop((0, 0, w, int(h * GROUND_FRAC[stage]))))


def generate(rgb, grid, coarse=False):
    from segment_anything import SamAutomaticMaskGenerator, sam_model_registry
    sam = sam_model_registry['vit_b'](checkpoint=CKPT)
    sam.to('cpu')
    # TEXT IS FOUND BY DEFAULT. SAM's stock thresholds are tuned to return
    # objects and they drop letters — on L5P they missed the C and the I in
    # CRIMINAL and the big CR monogram entirely. Every backdrop in this game is
    # a real Atlanta storefront covered in signage (CITGO, WELCOME TO EAST
    # ATLANTA, CRIMINAL RECORDS, WAFFLE HOUSE, McDonald's), so lettering is not
    # an edge case here, it is most of what is worth isolating. Finding it must
    # not be something you have to remember to switch on.
    #
    # Raising the sampling grid does NOT fix it: 28 -> 48 moved L5P coverage
    # 85.0% -> 86.0%. A letter that size lands under the area floor and the
    # confidence bar, so those are what come down.
    #
    # --coarse restores the stock thresholds for a quick structural pass.
    gen = SamAutomaticMaskGenerator(
        sam,
        points_per_side=grid,
        pred_iou_thresh=0.80 if coarse else 0.68,
        stability_score_thresh=0.88 if coarse else 0.80,
        # These plates are dark and low-contrast; the default crop layers add
        # a lot of CPU time for very little on art this flat.
        crop_n_layers=0,
        min_mask_region_area=400 if coarse else 60,
    )
    return gen.generate(rgb)


def iou(a, b):
    inter = int((a & b).sum())
    if not inter:
        return 0.0
    return inter / int((a | b).sum())


def cascade(rgb, grid):
    """Two passes, coarse then fine, merged — the default.

    One pass cannot do both jobs. The coarse settings return whole objects
    with clean outlines and silently drop lettering; the fine settings find
    the 9px-wide I in CRIMINAL but also fragment big shapes into their parts,
    so a facade comes back as forty bricks instead of a facade. Running both
    and merging gets the structure AND the detail, which is what a backdrop
    needs: the big outlines decide the depth cards, the small ones are the
    glow targets.

    Coarse wins ties. A fine mask is kept only if it is not already telling
    us the same thing as a coarse one — IoU under 0.75 against every coarse
    mask — so the merged set is the coarse structure plus whatever detail the
    fine pass found inside it.
    """
    print('  pass 1/2 — coarse, for object outlines')
    big = generate(rgb, max(16, grid // 2), coarse=True)
    print(f'    {len(big)} masks')
    print('  pass 2/2 — fine, for lettering and detail')
    small = generate(rgb, grid, coarse=False)
    print(f'    {len(small)} masks')

    bigsegs = [m['segmentation'] for m in big]
    kept = list(big)
    dropped = 0
    for m in small:
        s = m['segmentation']
        if any(iou(s, b) >= 0.75 for b in bigsegs):
            dropped += 1
            continue
        kept.append(m)
    print(f'  merged: {len(kept)} masks ({dropped} fine masks were duplicates '
          f'of a coarse one)')
    return kept


def emit(stage, groups_path):
    """Freeze chosen SAM masks as committed 1-bit PNGs.

    The raw .npy SAM writes is 130MB and its indices shift the moment the
    sampling grid changes, so neither is a thing to build a plane set on. The
    groups file records WHICH mask indices were judged to be each card — that
    is the reviewable decision — and this bakes their union into a PNG the
    cutter can load. Re-running SAM only means re-checking the groups file.
    """
    import numpy as np
    M = np.load(os.path.join(OUT, f'{stage}_masks.npy'))
    groups = json.load(open(groups_path))
    dest = os.path.join(ROOT, 'tools', 'sam_masks', stage)
    os.makedirs(dest, exist_ok=True)
    for name, idxs in groups.items():
        u = np.zeros(M.shape[1:], bool)
        for k in idxs:
            u |= M[k]
        ys, xs = np.where(u)
        Image.fromarray((u * 255).astype(np.uint8)).convert('1').save(
            os.path.join(dest, f'{name}.png'), optimize=True)
        kb = os.path.getsize(os.path.join(dest, f'{name}.png')) / 1024
        print(f'  {name:12s} {int(u.sum()):7d}px  '
              f'x {xs.min()}..{xs.max()}  y {ys.min()}..{ys.max()}  {kb:.1f} kB')


def main():
    stage = sys.argv[1]
    if '--emit' in sys.argv:
        emit(stage, sys.argv[sys.argv.index('--emit') + 1])
        return
    grid = 32
    if '--grid' in sys.argv:
        grid = int(sys.argv[sys.argv.index('--grid') + 1])
    rgb = load_plate(stage)
    h, w = rgb.shape[:2]
    print(f'{stage}: {w}x{h} crop, points_per_side={grid} '
          f'({grid * grid} prompts) — CPU, this takes a while')

    coarse = '--coarse' in sys.argv
    masks = generate(rgb, grid, True) if coarse else cascade(rgb, grid)
    print(f'  SAM returned {len(masks)} masks')

    # Rank by area. A card is worth having if it is big enough to read as its
    # own object and small enough not to be "most of the picture".
    masks.sort(key=lambda m: -m['area'])
    floor = 400 if coarse else 80
    keep = [m for m in masks if floor <= m['area'] <= 0.55 * w * h]
    print(f'  {len(keep)} in the usable size band ({floor}px .. 55% of plate)')

    os.makedirs(OUT, exist_ok=True)
    rec = []
    for i, m in enumerate(keep):
        x, y, bw, bh = m['bbox']
        rec.append({
            'i': i, 'area': int(m['area']),
            'bbox': [int(x), int(y), int(x + bw), int(y + bh)],
            'iou': round(float(m['predicted_iou']), 3),
            'stability': round(float(m['stability_score']), 3),
        })
    with open(os.path.join(OUT, f'{stage}_masks.json'), 'w') as f:
        json.dump(rec, f, indent=1)
    np.save(os.path.join(OUT, f'{stage}_masks.npy'),
            np.stack([m['segmentation'] for m in keep]) if keep
            else np.zeros((0, h, w), bool))

    # Proposal sheet: every mask tinted and numbered over the darkened plate,
    # so the numbers in the JSON can be matched to things by eye.
    PAL = [(255, 96, 96), (255, 196, 64), (96, 230, 140), (110, 170, 255),
           (220, 120, 255), (90, 245, 235), (255, 150, 40), (150, 255, 90)]
    sheet = (rgb * 0.30).astype(np.uint8).copy()
    for i, m in enumerate(keep):
        c = PAL[i % len(PAL)]
        seg = m['segmentation']
        sheet[seg] = (sheet[seg] * 0.35 + np.array(c) * 0.65).astype(np.uint8)
    img = Image.fromarray(sheet)
    d = ImageDraw.Draw(img)
    for i, m in enumerate(keep):
        x, y, bw, bh = m['bbox']
        d.text((x + 2, y + 2), str(i), fill=(255, 255, 255))
    img.save(os.path.join(OUT, f'{stage}_proposals.png'))
    print(f'  -> {stage}_proposals.png, {stage}_masks.json, {stage}_masks.npy')
    for r in rec[:25]:
        print(f"   #{r['i']:<3d} {r['area']:7d}px  bbox {r['bbox']}  iou {r['iou']}")


if __name__ == '__main__':
    main()
