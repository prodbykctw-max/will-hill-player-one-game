#!/usr/bin/env python3
"""
Cut the movers out of a still scene — the title painting and the ending
painting — and inpaint the base underneath them.

HOW THIS DIFFERS FROM cut_planes.py, AND WHY IT IS A SEPARATE TOOL.

A stage backdrop has to account for every pixel: each card scrolls at its own
parallax rate, so anything left behind in the base slides against the thing it
belongs to and the illusion collapses. That is why cut_planes.py carries a
hand-ordered plane list, material rejects, and a depth for every item.

A still scene does not scroll. The client's instruction was to use his
painting WHOLE, and that is what happens — the base IS the painting. The only
things that need lifting off it are the handful of pieces that MOVE, and
everything else stays exactly where he painted it. So there is no depth
ordering to get right, no parallax rates, and no obligation to claim the whole
plate. Most masks are deliberately left unassigned.

WHY THE BASE IS STILL INPAINTED UNDER THE MOVERS. A card is drawn OVER the
base, so at rest the composite is the original painting pixel for pixel. The
moment it moves, the base's own copy of it peeks out from behind — a second
crowd, a ghost cloud. Erasing the mover from the base and filling the hole is
what stops that, and the fill is never seen at rest because the card is
sitting on top of it. Push-pull pyramid fill, shared with cut_planes.py.

WHY THE ALPHA IS FEATHERED. SAM edges are hard and per pixel, which is right
for a cutout and wrong for a thing that is about to be resampled at an
arbitrary screen scale: a 1px hard edge aliases into a crawling line as the
shear moves it. A sub-pixel feather costs nothing and the edge stays put.

Usage:
    python3 tools/cut_still.py title
    python3 tools/cut_still.py ending
    python3 tools/cut_still.py title --debug      # write proofs, no assets
"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

from cut_planes import pyramid_inpaint

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BG = os.path.join(ROOT, 'src', 'assets', 'backgrounds')
SAM = os.path.join(ROOT, 'tools', 'sam_masks')

# Which emitted groups are actually LIFTED off the plate. A group that is not
# listed here was cut for one of two reasons and is then thrown away: to keep
# it OUT of a bigger group it would otherwise have polluted (`letters`, which
# sits inside the sky band and would have gone drifting off with the clouds),
# or because it turned out to be better handled without a card at all
# (`prompt`, whose cut came back partial — half the letters of PRESS START —
# and which is animated as a pulse over the painting's own text instead).
#
# `options` is not lifted in order to MOVE, it is lifted in order to be
# RELOCATED — see SPRITES below.
MOVERS = {
    'title': ['clouds', 'signL', 'signR', 'hero', 'options'],
    'ending': ['crowd', 'hero'],
}

# Groups emitted as INDIVIDUAL cropped sprites instead of one plate-sized
# card. A card can only ever be shifted as a unit; clouds have to travel
# across the sky independently and at their own speeds, so each one has to be
# its own little image with its own position. Cropped to its bounding box
# because ten plate-sized RGBAs that are 98% transparent is a lot of texture
# to push around for a few clouds.
#
# Split by CONNECTED COMPONENT, not by SAM mask: SAM returns overlapping and
# nested proposals for a cloud bank — #16 spans x 11..325 and #26 is a piece
# of the same clump at x 94..321 — and animating those as separate clouds
# would tear one cloud into two sliding halves.
SPRITES = {'title': ['clouds', 'options']}
MIN_SPRITE_PX = 150   # was 400, which dropped the small distant clouds

# Sprite groups emitted as ONE crop instead of one per connected component.
#
# OPTIONS is a WORD. Split by component it comes out as seven letters that
# would then have to be re-spaced by hand, and any drift between them is a
# typo. SAM returned it as a single blob anyway (mask #92, one component,
# 5401px) — this just says so out loud, so a future re-cut that happens to
# separate the O from the P cannot silently turn the word into confetti.
WHOLE = {'options'}

# Layers that must be drawn IN FRONT of the moving sprites. Without one, a
# cloud crossing the sky slides over the skyline and over the logo instead of
# behind them, and the client's note was explicit: the buildings stay put and
# the clouds move behind them.
#
# `behind` names the groups that are BEHIND the movers — sky plus the clouds'
# own footprint. Everything that is not behind, down to `floor`, is in front.
OCCLUDER = {
    'title': {'behind': ['sky', 'clouds'], 'floor': 340,
              'exclude': ['signL', 'signR', 'hero']},
}

FEATHER = 1.1   # px of gaussian softening on the alpha edge

# Groups whose card is RE-PLACED somewhere else instead of being drawn back
# over its own footprint. Everything else here is covered by itself at rest, so
# the fill underneath is never seen and the pyramid blur is plenty. `options`
# is lifted and moved, so its hole is on show permanently — and a blur is
# exactly the wrong texture to leave in a dithered pixel painting.
#
# MEASURED, because "you can't see it" was wrong. The fill came out with a
# high-frequency energy of 0.80 against the surrounding road's 4.35-5.68, and
# a mean of 15 against the road's 23-30. Blown up 4x it reads as a smooth,
# slightly dark rounded patch sitting in a speckled road — the shape of the
# word that used to be there, in negative.
RELOCATED = {'options'}


def retexture(rgb, base, mask, name):
    """Give a permanently-visible hole the road's own grain back.

    GRAIN ONLY, and the level is deliberately left alone. The fill looked 8-15
    levels too dark next to the road above it, and correcting for that made it
    WORSE: measured at the boundary itself the pyramid fill was already within
    0.5 levels of the road it meets, and adding an offset on top pushed the rim
    to -2.4 and put a visible edge where there had been none. The road has a
    real vertical gradient — 30 at the top of the strip, 23 at the bottom — so
    "the road nearby" is not one number to match, and the fill already carries
    that gradient correctly. The rim is the only honest test.

    What a blur genuinely cannot do is invent dither, so it is BORROWED: the
    high-frequency residual of a same-sized strip of real, untouched road
    directly below the hole is added on top. Real grain from the same material,
    not synthetic noise pretending to be it — this plate's dither is an ordered
    pattern rather than a random one, and gaussian noise does not look like it.
    """
    ys, xs = np.where(mask)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    H, W = y1 - y0, x1 - x0
    h, w = mask.shape

    # Donor strip: directly below, then directly above if that runs off the
    # plate. It has to be clear of the hole itself and of the plate's edge.
    dy = y1 + 4
    if dy + H > h:
        dy = y0 - 4 - H
    if dy < 0 or dy + H > h:
        raise SystemExit(f'{name}: nowhere to take a texture donor from')
    donor = rgb[dy:dy + H, x0:x1].astype(np.float32)
    grain = donor - ndi.gaussian_filter(donor, (1.4, 1.4, 0))

    out = base.astype(np.float32)
    sub = mask[y0:y1, x0:x1][..., None]
    out[y0:y1, x0:x1] = np.where(sub, out[y0:y1, x0:x1] + grain,
                                 out[y0:y1, x0:x1])
    return np.clip(out, 0, 255).astype(np.uint8)


# ── CLOUDS ARE KEYED, NOT TAKEN FROM SAM ─────────────────────────────────
#
# SAM's `clouds` group found six blobs, four of them over the sprite floor,
# and the client's note was that nearly every cloud in the sky should move —
# "why only some clouds in the sky be moving". The rest were inside the single
# 438,000-pixel `sky` mask and had never been lifted at all.
#
# A cloud is the one thing in this sky that is LIGHTER than the sky around it,
# so a local-contrast key finds all of them and cannot be fooled by the logo or
# the signs. Three constraints, each of which was added because the version
# without it was wrong:
#
#   ROW-MEDIAN BACKGROUND, sky pixels only. A box blur as the background
#   estimate gets dragged down by the dark skyline, so the bright HAZE around
#   the towers reads as lifted and the key claims a pink smear across the
#   middle of the frame. Comparing each pixel to its own row's sky level fixes
#   that, and the night sky's gradient is vertical so a row is the right unit.
#
#   A CEILING AT ROW 280. Below that is skyline, not weather.
#
#   THE LETTERING IS EXCLUDED, dilated by 9px. WILL HILL: PLAYER ONE has a
#   bright outline sitting in the sky, and it is not a cloud.
#
# WHAT IT ACTUALLY FINDS, and this is worth knowing before promising more:
# EIGHT clouds, not dozens. The size distribution falls off a cliff — 15391,
# 14824, 7051, 1707, 1431, then nothing above 38px. The two big banks were
# tested for thin bridges by eroding up to 9x9 and they do not come apart:
# they are solid masses, and splitting a solid cloud in half would tear it.
# Eight is the number the painting has.
CLOUD_LIFT = 9        # levels above the row's own sky median
CLOUD_FLOOR_ROW = 280 # below this is skyline
CLOUD_SPLIT = 7       # erosion that separates touching puffs, in px


def keyed_clouds(rgb, scene):
    """Every cloud in the sky, by local contrast. See the note above."""
    sky = load_mask(scene, 'sky', rgb.shape[1], rgb.shape[0])
    block = np.zeros(sky.shape, bool)
    for nm in ('letters', 'star'):
        p = os.path.join(SAM, scene, f'{nm}.png')
        if os.path.exists(p):
            block |= load_mask(scene, nm, rgb.shape[1], rgb.shape[0])
    block = ndi.binary_dilation(block, np.ones((9, 9), bool))

    lum = rgb.astype(np.float32).mean(2)
    rowbg = np.array([np.median(lum[y][sky[y]]) if sky[y].sum() > 20 else 0.0
                      for y in range(lum.shape[0])], dtype=np.float32)
    m = sky & ((lum - rowbg[:, None]) > CLOUD_LIFT) & ~block
    m[CLOUD_FLOOR_ROW:] = False
    m = ndi.binary_fill_holes(ndi.binary_opening(m, np.ones((2, 2), bool)))

    # Separate puffs that touch, by eroding to seeds and growing each seed
    # back over the mask. Straight labelling merges a whole bank into one.
    seeds, n = ndi.label(ndi.binary_erosion(m, np.ones((CLOUD_SPLIT,) * 2, bool)))
    if n:
        idx = ndi.distance_transform_edt(seeds == 0, return_distances=False,
                                         return_indices=True)
        return np.where(m, seeds[tuple(idx)], 0), n
    return ndi.label(m)


def load_mask(scene, name, w, h):
    p = os.path.join(SAM, scene, f'{name}.png')
    m = np.array(Image.open(p).convert('1'), bool)
    if m.shape != (h, w):
        raise SystemExit(f'{p}: {m.shape[1]}x{m.shape[0]} vs plate {w}x{h}')
    return m


def main():
    scene = sys.argv[1]
    debug = '--debug' in sys.argv
    names = MOVERS[scene]

    plate = Image.open(os.path.join(BG, f'{scene}.webp')).convert('RGB')
    rgb = np.asarray(plate)
    h, w = rgb.shape[:2]
    print(f'{scene}: {w}x{h}, {len(names)} movers')

    claimed = np.zeros((h, w), bool)
    cards = {}
    labels = {}
    for name in names:
        if name == 'clouds' and scene == 'title':
            lab, _ = keyed_clouds(rgb, scene)
            labels[name] = lab
            m = lab > 0
        else:
            m = load_mask(scene, name, w, h)
        # Close pinholes so a face does not come out with gaps where SAM put a
        # boundary between a cheek and a pair of glasses.
        m = ndi.binary_fill_holes(ndi.binary_closing(m, np.ones((3, 3), bool)))
        cards[name] = m
        claimed |= m
        ys, xs = np.where(m)
        print(f'  {name:8s} {int(m.sum()):7d}px  '
              f'x {xs.min()}..{xs.max()}  y {ys.min()}..{ys.max()}')

    # One fill for all of them at once. Filling them one at a time would let
    # an earlier card's blurred hole become source material for a later one.
    base = pyramid_inpaint(rgb, claimed)
    # Then put the grain back under anything that is not coming back to cover
    # its own hole. After the fill, so the donor is taken from the original.
    for name in names:
        if name in RELOCATED:
            base = retexture(rgb, base, cards[name], name)

    if debug:
        Image.fromarray(base).save(f'/tmp/{scene}_base_proof.png')
        Image.fromarray((claimed * 255).astype(np.uint8)).save(f'/tmp/{scene}_claim_proof.png')
        print(f'  -> /tmp/{scene}_base_proof.png  /tmp/{scene}_claim_proof.png')
        return

    Image.fromarray(base).save(os.path.join(BG, f'{scene}-base.webp'),
                               quality=92, method=6)
    print(f'  base -> {scene}-base.webp')

    def alpha_of(m):
        a = ndi.gaussian_filter(m.astype(np.float32), FEATHER)
        # Re-bias so the feather eats into the OUTSIDE of the silhouette
        # rather than thinning the item: a crowd whose every head lost a pixel
        # of alpha reads as a crowd behind frosted glass.
        a = np.clip((a - 0.32) / 0.5, 0, 1)
        return np.maximum(a, m.astype(np.float32))

    sprite_groups = SPRITES.get(scene, [])
    manifest = {}
    for name, m in cards.items():
        if name in sprite_groups:
            if name in WHOLE:
                lab, n = np.where(m, 1, 0), 1
                sizes = [int(m.sum())]
            elif name in labels:
                # Already split into puffs by keyed_clouds; plain labelling
                # here would merge a whole bank back into one sprite.
                lab = labels[name]
                n = int(lab.max())
                sizes = ndi.sum(m, lab, range(1, n + 1))
            else:
                lab, n = ndi.label(m)
                sizes = ndi.sum(m, lab, range(1, n + 1))
            items = []
            for i, sz in enumerate(sizes, start=1):
                if sz < MIN_SPRITE_PX:
                    continue
                one = lab == i
                ys, xs = np.where(one)
                # Pad by the feather so the softened edge is not clipped off
                # by the crop it is supposed to soften.
                pad = 3
                x0 = max(0, xs.min() - pad); x1 = min(w, xs.max() + 1 + pad)
                y0 = max(0, ys.min() - pad); y1 = min(h, ys.max() + 1 + pad)
                a = alpha_of(one)[y0:y1, x0:x1]
                sub = np.dstack([rgb[y0:y1, x0:x1], (a * 255).astype(np.uint8)])
                fn = f'{scene}-{name}{len(items)}.webp'
                Image.fromarray(sub, 'RGBA').save(os.path.join(BG, fn),
                                                  quality=92, method=6)
                items.append({'file': fn, 'x': int(x0), 'y': int(y0),
                              'w': int(x1 - x0), 'h': int(y1 - y0),
                              'px': int(sz)})
            items.sort(key=lambda d: -d['px'])
            manifest[name] = items
            print(f'  {name:8s} -> {len(items)} sprites from {n} components')
            for d in items:
                kb = os.path.getsize(os.path.join(BG, d['file'])) / 1024
                print(f'      {d["file"]:26s} {d["w"]:4d}x{d["h"]:3d} at '
                      f'{d["x"]:4d},{d["y"]:3d}  {d["px"]:6d}px  {kb:.0f} kB')
            continue

        out = np.dstack([rgb, (alpha_of(m) * 255).astype(np.uint8)])
        Image.fromarray(out, 'RGBA').save(
            os.path.join(BG, f'{scene}-{name}.webp'), quality=92, method=6)
        kb = os.path.getsize(os.path.join(BG, f'{scene}-{name}.webp')) / 1024
        print(f'  {name:8s} -> {scene}-{name}.webp  {kb:.0f} kB')

    # ── THE OCCLUDER ─────────────────────────────────────────────────────
    occ = OCCLUDER.get(scene)
    if occ:
        behind = np.zeros((h, w), bool)
        for nm in occ['behind']:
            behind |= load_mask(scene, nm, w, h)
        # Fill holes so the gaps SAM left between sky and cloud — the thin
        # halo round a cloud's edge — do not come out as confetti in front of
        # the very clouds they belong to.
        behind = ndi.binary_fill_holes(ndi.binary_closing(behind, np.ones((5, 5), bool)))
        front = ~behind
        # Only as far down as a cloud can ever reach. Below that the base
        # already has it and a second copy is just bytes.
        front[occ['floor']:, :] = False
        for nm in occ.get('exclude', []):
            front &= ~cards[nm] if nm in cards else ~load_mask(scene, nm, w, h)
        front = ndi.binary_fill_holes(front)
        out = np.dstack([rgb, (alpha_of(front) * 255).astype(np.uint8)])
        Image.fromarray(out, 'RGBA').save(
            os.path.join(BG, f'{scene}-front.webp'), quality=92, method=6)
        kb = os.path.getsize(os.path.join(BG, f'{scene}-front.webp')) / 1024
        ys, xs = np.where(front)
        print(f'  front    -> {scene}-front.webp  {int(front.sum())}px  '
              f'x {xs.min()}..{xs.max()}  y {ys.min()}..{ys.max()}  {kb:.0f} kB')

    if manifest:
        p = os.path.join(BG, f'{scene}-sprites.json')
        json.dump(manifest, open(p, 'w'), indent=2)
        print(f'  manifest -> {scene}-sprites.json')


if __name__ == '__main__':
    main()
