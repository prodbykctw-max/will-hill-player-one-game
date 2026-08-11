#!/usr/bin/env python3
"""
Isolate individual items out of a stage backdrop so each can be given its own
parallax rate, and the backdrop can read as a space rather than a picture.

THE MODEL — cardboard cutouts, not sliced bands.
Think of the old South Park sets: every item is a whole, clean piece of card,
and the pieces sit on top of one another. Move one and what shows behind it is
the next piece, complete. Nothing is a rectangular chunk of a bigger picture
and nothing has a bite taken out of it.

WHERE THE EDGE COMES FROM — the art, per pixel. Not from a line I drew.
This is the thing every earlier attempt in this repo got wrong:

  * split_layers.py  cut the image into boxes. Boxes slice through objects.
  * cut_objects.py   traced one object's ellipse by hand. Right idea, but the
                     hand-drawn curve never sits on the real edge.
  * cut_layers.py    disjoint distance planes with rectangle priority. It
                     worked, and the rectangle boundaries read as hard cuts.

So a polygon here is only a REGION OF INTEREST — a loose fence that says which
item we are talking about. It never becomes the visible edge. The visible edge
is found per pixel:

  1. The sky is flood-filled once, globally, from the border of the frame
     inward. The sky is by definition the background you can reach from
     outside, so this lands exactly on every silhouette in the plate at once —
     every leaf, every plank top, every gap between planks.
  2. Inside its ROI an item is whatever is left after the sky and after any
     `reject` rule that names another item's material by colour (the Citgo's
     saturated red intruding into the tree's ROI, say).
  3. Holes enclosed by the item are filled back in, so dark leaves inside the
     canopy and the dark mesh inside the Welcome sign stay part of the item.

Only where two ITEMS meet does my polygon actually decide anything, and even
there it usually does not have to: items are listed far -> near and the NEARER
one owns any overlap, so the fence takes its own overlap with the canopy
behind it and the canopy keeps a clean edge.

WHY THE BASE IS INPAINTED. An isolated item is erased from the base plate and
the hole filled, or it would appear twice the moment its rate diverged. The
fill is a push-pull pyramid rather than the old "stretch the band above
downward", which left vertical streaks. What lands in the hole is whatever
surrounds it, blurred — and the hole is covered by the item at rest, at night,
under the aerial wash, so a soft fill there is invisible.

Usage:
    python3 tools/cut_planes.py                # cut every stage with planes
    python3 tools/cut_planes.py eav            # just one
    python3 tools/cut_planes.py eav --debug    # overlays only, write nothing
    python3 tools/cut_planes.py eav --proof    # + per-item zoomed trace sheet
"""

import os
import sys

import json

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BG = os.path.join(ROOT, 'src', 'assets', 'backgrounds')
DEBUG_DIR = os.path.join(ROOT, 'tools', 'captures', 'planes')


# ── Colour rules ──────────────────────────────────────────────────────────
# Sampled from the plate, not guessed: EAV's sky medians (8,11,26) with a p90
# of (15,18,51) — dark and decisively blue-dominant, while everything built in
# frame is either brighter or warmer.

def _chan(rgb):
    return (rgb[..., 0].astype(np.int16),
            rgb[..., 1].astype(np.int16),
            rgb[..., 2].astype(np.int16))


def is_sky(rgb):
    """Strictly blue-dominant AND dark.

    Blue-dominance is doing the real work. An earlier version also called any
    very dark pixel sky, and that was a disaster: shadow inside the tree, under
    the Citgo canopy and between the fence planks is all near-black and all
    connected to the real sky, so the fill walked straight in through the
    shadows and ate the middle out of every item. Shadow is warm or neutral
    here; only the sky is blue.
    """
    r, g, b = _chan(rgb)
    lum = (r * 299 + g * 587 + b * 114) // 1000
    return (b - r >= 6) & (b - g >= 3) & (lum < 60)


def is_hot_red(rgb):
    """The Citgo roof / fascia — strongly red-dominant and not dark."""
    r, g, b = _chan(rgb)
    return (r - g > 34) & (r - b > 30) & (r > 70)


def is_pale_neutral(rgb):
    """The grey-white canopy wedge under the Citgo roof.

    Threshold measured, not guessed: the wedge samples at (97,77,63), luminance
    81. An earlier cut required >88 and so failed to reject it, which is
    exactly how the tree came to swallow the Citgo canopy — the two are
    interleaved there, leaves in front of a hard-angled soffit, and colour is
    the only thing that can tell them apart.
    """
    r, g, b = _chan(rgb)
    lum = (r * 299 + g * 587 + b * 114) // 1000
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    return (lum > 62) & (mx - mn < 46)


def is_deep_shadow(rgb):
    """Unlit black — the soffit under the Citgo canopy.

    This is what sits directly above the fence planks between x 340 and 500,
    where there is no sky for the key to find. Rejecting it lets the fence
    trace its own plank tops against the shadow instead of against a straight
    line drawn near them.
    """
    r, g, b = _chan(rgb)
    return (r * 299 + g * 587 + b * 114) // 1000 < 26


REJECTS = {
    'hot_red': is_hot_red,
    'pale_neutral': is_pale_neutral,
    'deep_shadow': is_deep_shadow,
}


# ── Region ops ────────────────────────────────────────────────────────────

CONN8 = np.ones((3, 3), bool)


def disk(r):
    y, x = np.mgrid[-r:r + 1, -r:r + 1]
    return x * x + y * y <= r * r + 1


def border_connected(mask):
    """The part of `mask` reachable from outside the frame.

    Used to define the sky: the background is whatever you can walk to from
    the edge of the picture. Every silhouette in the plate falls out of this
    one operation at once — leaf edges, plank tops, the gaps between planks.
    """
    lab, n = ndi.label(mask, structure=CONN8)
    if not n:
        return np.zeros_like(mask)
    edge = np.concatenate([lab[0, :], lab[-1, :], lab[:, 0], lab[:, -1]])
    keep = np.unique(edge[edge > 0])
    return np.isin(lab, keep)


def drop_specks(mask, min_px):
    """Discard blobs below `min_px` — confetti the colour key leaves behind."""
    if min_px <= 0 or not mask.any():
        return mask
    lab, n = ndi.label(mask, structure=CONN8)
    if not n:
        return mask
    sizes = np.bincount(lab.ravel())
    sizes[0] = 0
    return np.isin(lab, np.nonzero(sizes >= min_px)[0])


def rasterize(polys, w, h):
    m = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(m)
    for p in polys:
        d.polygon([tuple(q) for q in p], fill=255)
    return np.array(m) > 127


def refine_grabcut(rgb, mask, iters=4, band=3):
    """Snap a mask onto the true object boundary — GrabCut (Rother et al. 2004).

    Graph-cut foreground extraction. It is given a trimap rather than a box:
    the mask eroded by `band` is certain foreground, everything more than
    `band` outside it is certain background, and only the collar between the
    two is left undecided. It then fits colour models to each side and cuts
    along the cheapest boundary through that collar.

    The point is that the final edge is chosen from the ART, not from anything
    drawn by hand — it walks around individual leaves and plank ends that no
    polygon and no single colour threshold would land on.
    """
    if not mask.any():
        return mask
    sure_fg = ndi.binary_erosion(mask, disk(band))
    sure_bg = ~ndi.binary_dilation(mask, disk(band))
    if not sure_fg.any():
        return mask
    gc = np.full(mask.shape, cv2.GC_PR_BGD, np.uint8)
    gc[mask] = cv2.GC_PR_FGD
    gc[sure_fg] = cv2.GC_FGD
    gc[sure_bg] = cv2.GC_BGD
    try:
        cv2.grabCut(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), gc, None,
                    np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64),
                    iters, cv2.GC_INIT_WITH_MASK)
    except cv2.error:
        return mask
    return (gc == cv2.GC_FGD) | (gc == cv2.GC_PR_FGD)


def trace_contours(mask, min_area=24):
    """Moore-neighbour contour trace — the item's outline as real polygons.

    Exported alongside each card so every item has an addressable shape, not
    just an alpha channel: the outline is what a later pass needs to put a glow
    on one bulb, or a sway pivot on one shrub.
    """
    cs, _ = cv2.findContours((mask * 255).astype(np.uint8),
                             cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    return [c.reshape(-1, 2).tolist() for c in cs if cv2.contourArea(c) >= min_area]


# ── Fill ──────────────────────────────────────────────────────────────────

def pyramid_inpaint(rgb, hole, levels=9):
    """Push-pull fill: pull colour down a pyramid, push it back into holes."""
    col = rgb.astype(np.float64).copy()
    col[hole] = 0
    wgt = (~hole).astype(np.float64)

    pyr = [(col, wgt)]
    for _ in range(levels):
        c, a = pyr[-1]
        ch, cw = c.shape[0], c.shape[1]
        if ch < 2 or cw < 2:
            break
        nh, nw = (ch + 1) // 2, (cw + 1) // 2
        cp = np.zeros((nh * 2, nw * 2, 3))
        ap = np.zeros((nh * 2, nw * 2))
        cp[:ch, :cw] = c * a[..., None]
        ap[:ch, :cw] = a
        c2 = cp.reshape(nh, 2, nw, 2, 3).sum((1, 3))
        a2 = ap.reshape(nh, 2, nw, 2).sum((1, 3))
        nz = a2 > 0
        c2[nz] /= a2[nz][..., None]
        pyr.append((c2, np.minimum(a2, 1.0)))

    for i in range(len(pyr) - 2, -1, -1):
        c, a = pyr[i]
        cc, _ = pyr[i + 1]
        up = np.array(
            Image.fromarray(np.clip(cc, 0, 255).astype(np.uint8))
            .resize((c.shape[1], c.shape[0]), Image.BILINEAR)
        ).astype(np.float64)
        gap = 1.0 - a
        pyr[i] = (c * a[..., None] + up * gap[..., None], np.ones_like(a))

    out = rgb.astype(np.float64).copy()
    out[hole] = pyr[0][0][hole]
    return np.clip(out, 0, 255).astype(np.uint8)


# ── Items ─────────────────────────────────────────────────────────────────
#
# Listed FAR -> NEAR. The nearer item wins any overlap.
#
# `roi`     one or more loose polygons in source pixels. Not the edge — just
#           "which item are we talking about". Accurate only where this item
#           abuts something FARTHER, since nothing else will trim it there.
# `reject`  colour rules naming another item's material that pokes into this
#           ROI, so the trace can walk around it per pixel.
# `keep_sky` items that are themselves dark and blue (none so far) can opt out
#           of the global sky subtraction.
# `holes`   fill enclosed gaps (default True). The fence wants False — the
#           slits between planks should stay open and show the layer behind.
#
# Rates live in src/world/stages.js. This script only cuts.

PLANES = {
    'eav': [
        {
            # Downtown skyline and the lit storefront row across the
            # intersection — the farthest built thing in frame.
            'name': 'skyline',
            'roi': [[(1148, 138), (1536, 138), (1536, 336), (1148, 336)]],
            'close': 1,
            'holes': False,   # the gaps between distant buildings are real sky
            'min_px': 60,
            'feather': 0.7,
        },
        {
            # McDonald's sign across the intersection — the farthest built
            # thing worth its own card. The arches are a real silhouette
            # against sky, so this one is keyed; the ROI stops above the
            # distant storefront row at y~290, which is farther still.
            'name': 'mcdonalds',
            'roi': [[(1408, 128), (1532, 128), (1532, 274), (1408, 274)]],
            'close': 1,
            'holes': False,   # the gap between the two arches is real sky
            'min_px': 40,
            'feather': 0.7,
        },
        {
            # Parked cars across the intersection. Dark bodies on a dark wet
            # street, so the shadow reject does the separating; what is left
            # is the lit bodywork, glass and tail-lights.
            'name': 'cars',
            'roi': [
                [(1164, 322), (1356, 322), (1356, 370), (1164, 370)],
                [(1458, 328), (1532, 328), (1532, 372), (1458, 372)],
            ],
            'reject': ['deep_shadow'],
            'close': 3,       # pull the lit fragments into whole bodies
            'min_px': 30,
            'feather': 0.7,
        },
        {
            # Swifty billboard. This one is NOT keyed: it is a flat rectangular
            # panel in perspective, so its four straight edges are the real
            # edges and a quad traced on them is already pixel-exact — corners
            # read off the art at 5x. Keying it would be actively wrong, since
            # the panel's own dark blue field is the same colour as the sky
            # behind it and the fill would walk straight through the board.
            # The Citgo roof cuts the bottom-right; the Citgo is nearer and
            # takes that overlap back.
            'name': 'swifty',
            'roi': [[(210, 17), (656, 18), (656, 107), (210, 143)]],
            'keep_sky': True,
            'feather': 0.7,
        },
        {
            # The top of the Citgo station: red roof, fascia, CITGO sign and
            # the pale canopy wedge beneath. Traced along the roofline, which
            # is the one edge nothing else will trim — above it is billboard
            # and sky, both farther away.
            'name': 'citgo',
            # The roofline, read off the art at 3-4x. It has to be right: it is
            # the boundary against the billboard, which is FARTHER, so nothing
            # trims it for me — and a line drawn only 15px low here left a pale
            # diagonal ghost of the roof's highlight edge stranded on the base
            # plate, claimed by nobody.
            'roi': [[
                (134, 194), (168, 185), (200, 177), (232, 169), (262, 160),
                (290, 148), (312, 136), (336, 124), (368, 117), (400, 111),
                (432, 106), (466, 100), (500, 95), (560, 92), (620, 90),
                (700, 88), (770, 91), (820, 97), (852, 103),
                (852, 372), (134, 372),
            ]],
            'min_px': 200,
            'feather': 0.7,
        },
        {
            # The street tree and the shrub mass along the kerb. Its ROI laps
            # over the Citgo roof, so the roof's own red and the canopy's pale
            # grey are rejected by colour and the trace walks the foliage leaf
            # by leaf instead of on a drawn curve.
            'name': 'tree',
            'roi': [[
                (0, 0), (208, 0), (208, 232), (300, 232), (400, 242),
                (470, 264), (478, 306), (478, 470), (330, 508), (0, 508),
            ]],
            'reject': ['hot_red', 'pale_neutral'],
            'reject_after': True,   # keep the canopy out of the tree for good
            'close': 1,      # consolidate the leaf mass without losing the edge
            'min_px': 400,
            'feather': 0.7,
        },
        {
            # The whole fence, Welcome sign included — one plane, as the fence
            # plainly is one object. The top edge is the plank line and is the
            # only place here a polygon really decides: left of x~850 the
            # Citgo sits behind it, and the Citgo is farther.
            'name': 'fence',
            'roi': [[
                (340, 270), (372, 252), (410, 238), (450, 228), (490, 216),
                (530, 204), (570, 196), (620, 180), (660, 168), (700, 155),
                (740, 142), (780, 132), (812, 126), (846, 121), (880, 121),
                (902, 118), (922, 111), (942, 106), (962, 101), (982, 98),
                (1002, 96), (1022, 90), (1042, 96), (1062, 86), (1082, 84),
                (1102, 88), (1122, 86), (1142, 96), (1162, 104), (1182, 110),
                (1210, 118), (1210, 508), (340, 508),
            ]],
            # Above the planks is red fascia left of x~730 and black soffit
            # left of x~500 — never sky, so the global key cannot find this
            # edge. Rejecting those two materials by colour lets the fence
            # trace its own plank tops pixel by pixel; the polygon above is
            # only a loose ceiling over them.
            'reject': ['hot_red', 'deep_shadow'],
            'reject_roi': [[(330, 58), (880, 58), (880, 214), (330, 302)]],
            'close': 2,
            'min_px': 400,
            'feather': 0.7,
        },
        {
            # Shrub on the kerb right of the fence. Plant life, so it sways.
            'name': 'shrub_right',
            'roi': [[(1138, 396), (1252, 396), (1252, 480), (1138, 480)]],
            'close': 1,
            'min_px': 120,
            'feather': 0.7,
        },
        {
            # The grass verge running the width of the plate — the nearest
            # ground, and the last thing before the game's own street. Plant
            # life too: it gets a short, quick ripple rather than a sway.
            'name': 'verge',
            'roi': [[(0, 466), (1312, 466), (1312, 524), (0, 524)]],
            'close': 1,
            'min_px': 200,
            # Its top edge is the one boundary here with no real edge in the
            # art to land on, so it is dissolved rather than cut. It sits 30px
            # from the crop line, behind the game's own street and under the
            # floor fog, so a soft join is invisible.
            'feather': 2.4,
        },
        {
            # Traffic signal and its pole — the nearest thing in frame, and
            # the one that should rip past fastest. Two shapes, one card: the
            # signal head on its bracket, and the mast running the full height
            # of the plate.
            'name': 'pole',
            'roi': [
                [(1266, 34), (1396, 34), (1396, 158), (1266, 158)],
                [(1366, 0), (1400, 0), (1400, 508), (1366, 508)],
            ],
            'close': 1,
            'min_px': 50,
            'feather': 0.7,
        },
    ],
}


# ── Cut ───────────────────────────────────────────────────────────────────

def build_masks(rgb, items):
    h, w = rgb.shape[:2]

    # The sky, once, for the whole plate: the background you can reach from
    # outside the frame. Every silhouette in the picture falls out of this one
    # fill — leaves, plank tops, the gaps between planks.
    sky = border_connected(is_sky(rgb))
    # Thin sky tendrils threading into foliage would shred an item into lace.
    # Opening drops anything narrower than the brush, and the result is
    # re-tested for reachability so a pocket that gets pinched off deep inside
    # the tree stops counting as background.
    sky = border_connected(ndi.binary_opening(sky, disk(2)))

    masks = []
    for it in items:
        roi = rasterize(it['roi'], w, h)
        m = roi.copy()
        if not it.get('keep_sky'):
            m &= ~sky
        # A reject is scoped when it names material that only intrudes in one
        # part of the ROI. The fence needs black rejected along its top edge,
        # where the Citgo soffit sits above the planks — but NOT over the rest
        # of it, because the fence's own shadowed wood is just as black and an
        # unscoped rule deletes four fifths of the fence.
        rmask = (rasterize(it['reject_roi'], w, h)
                 if it.get('reject_roi') else np.ones((h, w), bool))
        for rname in it.get('reject', []):
            m &= ~(REJECTS[rname](rgb) & rmask)
        if it.get('close'):
            m = ndi.binary_closing(m, disk(it['close']))
        if it.get('open'):
            m = ndi.binary_opening(m, disk(it['open']))
        if it.get('holes', True):
            m = ndi.binary_fill_holes(m)
        m &= roi
        # Opt-in: re-apply the rejects AFTER the hole fill. Filling is what let
        # the tree take the Citgo canopy back — the canopy tip is enclosed by
        # foliage inside the tree's ROI, so it read as a hole and was filled
        # straight back in after the colour rule had correctly removed it. The
        # tree then carried a slice of hard architecture, and every time the
        # tree sheared, the Citgo visibly split along that slice.
        # NOT the default: the cars are held together BY their hole fill, and
        # re-rejecting shadow there deletes all but a tenth of them.
        if it.get('reject_after'):
            for rname in it.get('reject', []):
                m &= ~(REJECTS[rname](rgb) & rmask)
        if it.get('refine'):
            m = refine_grabcut(rgb, m, band=it.get('refine_band', 3)) & roi
            if it.get('holes', True):
                m = ndi.binary_fill_holes(m)
        m = drop_specks(m, it.get('min_px', 0))
        masks.append(m)

    # Nearer wins. Walk back from the nearest, subtracting what it claimed, so
    # no pixel is ever drawn by two cards at once.
    claimed = np.zeros((h, w), bool)
    out = []
    for m in reversed(masks):
        out.append(m & ~claimed)
        claimed |= m
    return list(reversed(out)), claimed, sky


TINTS = [(255, 96, 96), (255, 196, 64), (96, 230, 140), (110, 170, 255),
         (220, 120, 255), (90, 245, 235)]


def write_proof(rgb, items, masks, stage_id):
    """Each item alone on a checkerboard, so the trace can be judged."""
    h, w = rgb.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    check = np.where(((xx // 8 + yy // 8) % 2)[..., None], 60, 96)
    check = np.repeat(check, 3, axis=2).astype(np.uint8)
    tiles = []
    for it, m in zip(items, masks):
        ys, xs = np.nonzero(m)
        if not len(ys):
            continue
        card = np.where(m[..., None], rgb, check)
        x0, x1 = max(0, xs.min() - 6), min(w, xs.max() + 7)
        y0, y1 = max(0, ys.min() - 6), min(h, ys.max() + 7)
        tile = Image.fromarray(card[y0:y1, x0:x1])
        sc = max(1, min(3, 1400 // max(1, tile.width)))
        tile = tile.resize((tile.width * sc, tile.height * sc), Image.NEAREST)
        d = ImageDraw.Draw(tile)
        d.text((6, 6), f"{it['name']}  {int(m.sum())}px  x[{xs.min()}-{xs.max()}] "
                       f"y[{ys.min()}-{ys.max()}]", fill=(255, 255, 255))
        tiles.append(tile)
    if not tiles:
        return
    W = max(t.width for t in tiles)
    H = sum(t.height + 8 for t in tiles)
    sheet = Image.new('RGB', (W, H), (24, 24, 28))
    y = 0
    for t in tiles:
        sheet.paste(t, (0, y))
        y += t.height + 8
    sheet.save(os.path.join(DEBUG_DIR, stage_id + '_proof.png'))


def write_outline_proof(rgb, items, masks, stage_id):
    """The traced outline drawn back over the art, at 2x.

    The one image worth arguing over: it shows exactly which pixels each card
    took, on top of the pixels it took them from.
    """
    out = Image.fromarray(rgb).convert('RGB')
    out = out.resize((out.width * 2, out.height * 2), Image.NEAREST)
    d = ImageDraw.Draw(out)
    for i, (it, m) in enumerate(zip(items, masks)):
        col = TINTS[i % len(TINTS)]
        for c in trace_contours(m, min_area=12):
            if len(c) < 2:
                continue
            d.line([(x * 2, y * 2) for x, y in c] + [(c[0][0] * 2, c[0][1] * 2)],
                   fill=col, width=2)
        ys, xs = np.nonzero(m)
        if len(ys):
            d.text((int(xs.min()) * 2 + 3, int(ys.min()) * 2 + 3), it['name'], fill=col)
    out.save(os.path.join(DEBUG_DIR, stage_id + '_outline.png'))


def cut(stage_id, items, debug_only=False, proof=False):
    im = Image.open(os.path.join(BG, stage_id + '.webp')).convert('RGB')
    rgb = np.array(im)
    h, w = rgb.shape[:2]
    meta = {}
    masks, claimed, sky = build_masks(rgb, items)
    os.makedirs(DEBUG_DIR, exist_ok=True)

    # The map to read: flat colour per item over a darkened plate, showing
    # where the trace ACTUALLY landed rather than where the ROI was drawn.
    amap = (rgb * 0.30).astype(np.uint8).copy()
    for i, m in enumerate(masks):
        amap[m] = TINTS[i % len(TINTS)]
    Image.fromarray(amap).save(os.path.join(DEBUG_DIR, stage_id + '_assign.png'))
    if proof:
        write_proof(rgb, items, masks, stage_id)

    if debug_only:
        print(f'{stage_id}: debug only — ' +
              ', '.join(f"{it['name']}={int(m.sum())}" for it, m in zip(items, masks)))
        return

    base = pyramid_inpaint(rgb, claimed)
    # Seven tenths of this plate is now hole, so there is no real scenery left
    # to reconstruct and a sharp fill only produces ghosts — a smeared Welcome
    # sign hanging in mid-air where the fence used to be. Sink the fill instead:
    # blur it flat and darken it, ramped by distance from the nearest real
    # pixel so it fades out of the cut edge rather than starting at one. What a
    # card slides away from then reads as night depth behind it.
    soft = np.array(Image.fromarray(base).filter(ImageFilter.GaussianBlur(9)))
    k = np.clip(ndi.distance_transform_edt(claimed) / 14.0, 0, 1)[..., None]
    base = (base * (1 - k) + soft * 0.55 * k).astype(np.uint8)
    Image.fromarray(base).save(os.path.join(BG, f'{stage_id}-base.webp'),
                               'WEBP', quality=92, method=6)
    Image.fromarray(base).save(os.path.join(DEBUG_DIR, stage_id + '_base.png'))
    print(f'{stage_id}: base written, {int(claimed.sum())} px filled')

    for it, m in zip(items, masks):
        # Full-frame RGBA. Every card the same size as the plate means the
        # renderer needs no placement maths — the cutout is already where it
        # belongs — and a mostly-transparent WebP costs almost nothing.
        a = Image.fromarray((m * 255).astype(np.uint8))
        if it.get('feather'):
            a = a.filter(ImageFilter.GaussianBlur(it['feather']))
        av = np.array(a)
        layer = np.dstack([rgb, av])
        layer[av == 0] = 0   # nothing for WebP to invent along the edge
        name = f"{stage_id}-{it['name']}.webp"
        Image.fromarray(layer, 'RGBA').save(os.path.join(BG, name), 'WEBP',
                                            quality=94, method=6)
        ys, xs = np.nonzero(m)
        meta[it['name']] = {
            'px': int(m.sum()),
            'bbox': [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())],
            'frac': [round(float(xs.min()) / w, 5), round(float(ys.min()) / h, 5),
                     round(float(xs.max() + 1) / w, 5), round(float(ys.max() + 1) / h, 5)],
            'contours': trace_contours(m),
        }
        kb = os.path.getsize(os.path.join(BG, name)) / 1024
        print(f"  {it['name']:10s} {int(m.sum()):7d} px  "
              f"x[{xs.min():4d}-{xs.max():4d}] y[{ys.min():3d}-{ys.max():3d}]  "
              f"{kb:6.1f} kB  -> {name}")

    # Outlines and geometry alongside the cards. An item is then addressable as
    # a SHAPE, not just an alpha channel — which is what a later pass needs to
    # hang a glow on one bulb or a sway pivot on one shrub.
    with open(os.path.join(BG, f'{stage_id}-planes.json'), 'w') as f:
        json.dump({'source': [w, h], 'items': meta}, f, separators=(',', ':'))
    write_outline_proof(rgb, items, masks, stage_id)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    for sid in (args or list(PLANES)):
        if sid not in PLANES:
            print(f'no planes defined for {sid}', file=sys.stderr)
            continue
        cut(sid, PLANES[sid], '--debug' in sys.argv, '--proof' in sys.argv)


if __name__ == '__main__':
    main()
