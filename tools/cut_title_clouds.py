#!/usr/bin/env python3
"""Lift the clouds off the PORTRAIT title plate so they can drift again.

WHY THIS EXISTS. The landscape plate had drifting clouds; the portrait plate
that replaced it does not, and the client noticed: "the clouds ... they're
stationary, I want them to move across the skyline like they were in the
beginning ... isolate every cloud ... furthest back moves slowest, closest up
front moves fastest."

The old cuts (title-clouds0-7.webp) CANNOT be reused. They were cut from the
landscape painting: their coordinates run out to x=1532 and the portrait plate
is 853 wide. Wrong sky, wrong scale, wrong everything.

WHICH BLOBS ARE CLOUDS IS THE CLIENT'S CALL, NOT THE KEY'S

The automatic "is it above the skyline" test got 8 of 11 right and 2 wrong: it
threw out two real clouds for sitting against the towers. He looked at the
labelled scan and settled it — "the two yellow rectangles on the right are
actual clouds, the one on the left is actually just a building" — which is 10
clouds and 1 building, exactly the count he gave. So the set is PINNED BY
COORDINATE below and the skyline test is gone. Do not re-scan or re-threshold
it; that decision cost two rounds already.

The one building is the blob on top of the blue tower. The tall thin slivers
on the tan tower (w6 h96 and friends) are lit window columns, and the aspect
filter still drops those — it was right about them.

AND THE TOWERS BECOME A CARD, so clouds can pass BEHIND them as well as in
front. Client: "I want some of the clouds moving in front of and behind the
building... if that means cutting the building so they're stationary while
clouds move in front of and behind, that works." Depth is decided by SIZE, the
same signal that decides speed, so the two cues can never disagree.

TWO THINGS THE KEY HAS TO AVOID, both of which it got wrong first time:

  THE TITLE. "WILL HILL:" is white lettering on blue sky, which is exactly
  what a cloud looks like to a brightness key. The wordmark/logo/stars boxes
  from title-portrait-planes.json are masked out before anything else runs.

  BUILDING HIGHLIGHTS. Lit window columns on the tan tower key as bright and
  desaturated too, and come out as tall thin slivers (w6 h96). Anything
  taller than it is wide is dropped.

THE HOLE IS FILLED, and unlike the OPTIONS lift this is the easy case: sky is
a smooth vertical gradient with light dither, so an inpaint over it is
invisible. The fill is emitted as its own transparent-elsewhere PATCH rather
than by rewriting his painting — the base file stays exactly as he delivered
it, and the patch is one drawImage at runtime.

  python3 tools/cut_title_clouds.py
"""
import json
import pathlib
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from cut_planes import pyramid_inpaint   # noqa: E402  the project's own fill

ROOT = pathlib.Path(__file__).resolve().parent.parent
BG = ROOT / "src/assets/backgrounds"
PLATE = BG / "title-portrait.webp"
PLANES = BG / "title-portrait-planes.json"

# The ten, by their top-left corner on the plate. Pinned, not detected —
# see the note above. Any blob whose bbox origin is not in here is not a cloud.
CLOUDS = {
    (618, 52), (31, 44), (0, 425), (749, 212), (0, 196),
    (606, 528), (252, 521), (230, 426), (432, 526), (21, 589),
}
# The single building blob the client identified, kept out by name so nobody
# "fixes" the filter later and quietly lets it back in.
BUILDING = (342, 476)
# Bigger than this is NEAR (drifts in FRONT of the towers). There is a clean
# gap in the measured areas between 2302 and 1109.
NEAR_MIN_PX = 2000

MIN_PX = 250          # smaller than this is dither, not weather
MAX_ASPECT = 1.4      # taller than this x its width is a building edge
FEATHER = 1.2         # px of alpha softening on the cut edge
DILATE = 6            # px the fill mask grows past the cloud


def main():
    im = Image.open(PLATE).convert("RGB")
    a = np.asarray(im).astype(np.float32)
    H, W, _ = a.shape
    R, B = a[..., 0], a[..., 2]
    mx, mn = a.max(axis=2), a.min(axis=2)
    sat = (mx - mn) / np.maximum(mx, 1)

    planes = json.load(open(PLANES))
    protect = np.zeros((H, W), bool)
    for k in ("wordmark", "logo", "stars"):
        if k not in planes:
            continue
        x0, y0, x1, y1 = planes[k]["frac"]
        protect[max(0, int(y0 * H) - 14):int(y1 * H) + 14,
                max(0, int(x0 * W) - 14):int(x1 * W) + 14] = True

    sky = (B - R > 25) & (B > 80) & (sat > 0.25)
    # ⚠️ TWO THRESHOLDS, NOT ONE. A single strong key takes the bright body of
    # each cloud and leaves its faint wisps and under-shadow behind — measured
    # as small white fragments still sitting in the sky after the fill, in the
    # exact shape of the bits that were missed. So: a STRICT key to find the
    # clouds, then a LOOSE one to grow each of them out to its real edge.
    # Only blobs seeded by the strict key survive, so the loose key cannot
    # invent a cloud out of pale sky on its own.
    strong = (mx > 120) & (sat < 0.42) & ((B - R) < 60) & ~protect
    weak = (mx > 95) & (sat < 0.55) & ((B - R) < 85) & ~protect
    strong[660:, :] = False
    weak[660:, :] = False
    # ⚠️ BOUNDED GROWTH, NOT binary_propagation. Unrestricted propagation
    # follows the loose key wherever it leads and BRIDGED separate clouds into
    # one blob through faint haze — three of the agreed ten stopped being
    # findable by their own coordinates. Dilating the strict mask a few pixels
    # and intersecting with the loose one picks up each cloud's own soft edge
    # and cannot reach across open sky to its neighbour.
    cloud = (ndimage.binary_dilation(strong, iterations=4) & weak) | strong
    cloud[660:, :] = False

    # The skyline: first run of 8 solid rows down each column. This is no
    # longer used to DECIDE what is a cloud — the client settled that — but it
    # is what the towers card is built from below.
    solid = ~(sky | cloud) & ~protect
    skyline = np.full(W, H)
    for x in range(W):
        for y in np.flatnonzero(solid[:660, x]):
            if y + 8 < 660 and solid[y:y + 8, x].all():
                skyline[x] = y
                break
    skyline = ndimage.minimum_filter(skyline, size=25)

    # Label the GROWN clouds, but identify them by the strict-key bbox the
    # agreed coordinates were measured from — growing moves an outline, and
    # the pinned set must not drift underneath it.
    lab, n = ndimage.label(cloud)
    objs = ndimage.find_objects(lab)
    sizes = ndimage.sum(cloud, lab, range(1, n + 1))
    slab, sn = ndimage.label(strong)
    sobjs = ndimage.find_objects(slab)
    ssz = ndimage.sum(strong, slab, range(1, sn + 1))
    # ⚠️ THE OWNER COMES FROM THE BLOB'S OWN PIXELS, NOT ITS BOUNDING BOX.
    # `lab[bbox].max()` reads the whole rectangle, so a bigger-numbered blob
    # merely passing through the corner of that box wins — five of the ten
    # agreed clouds were being attributed to a neighbour that way.
    # ndimage.maximum over the labelled regions asks only about the pixels
    # that actually belong to the blob.
    owners = ndimage.maximum(lab, slab, range(1, sn + 1))
    seed_keys = {}
    for si in range(1, sn + 1):
        if ssz[si - 1] < MIN_PX:
            continue                      # specks do not get to name a cloud
        owner = int(owners[si - 1])
        if owner:
            sl = sobjs[si - 1]
            seed_keys.setdefault(owner, set()).add((sl[1].start, sl[0].start))

    kept, skipped = [], []
    for i in range(1, n + 1):
        s = int(sizes[i - 1])
        if s < MIN_PX:
            continue
        sl = objs[i - 1]
        y0, y1 = sl[0].start, sl[0].stop
        x0, x1 = sl[1].start, sl[1].stop
        w, h = x1 - x0, y1 - y0
        # `key` identifies the blob against the agreed list and comes from the
        # STRICT outline; x0/y0/w/h stay the GROWN outline, which is what gets
        # cut. Conflating the two would shift every sprite by its own feather.
        keys = seed_keys.get(i, {(x0, y0)})
        hit = keys & CLOUDS
        key = min(hit) if hit else min(keys)
        if BUILDING in keys and not hit:
            skipped.append((s, x0, y0, w, h, "the building, his call"))
            continue
        if h > w * MAX_ASPECT or w < 24 or h < 10:
            skipped.append((s, x0, y0, w, h, "lit window column"))
            continue
        if not hit:
            skipped.append((s, x0, y0, w, h, "not in the agreed set"))
            continue
        kept.append({"i": i, "key": key, "keys": sorted(hit), "px": s, "x": x0, "y": y0,
                     "w": w, "h": h, "near": s >= NEAR_MIN_PX})

    kept.sort(key=lambda c: -c["px"])
    missing = CLOUDS - {k for c in kept for k in c["keys"]}
    if missing:
        sys.exit(f"the key no longer finds these agreed clouds: {sorted(missing)}")
    near = sum(1 for c in kept if c["near"])
    print(f"{len(kept)} clouds  ({near} near / {len(kept)-near} far), "
          f"{len(skipped)} rejected")
    for c in kept:
        print(f"   cut   px {c['px']:6d}  x{c['x']:4d} y{c['y']:4d} "
              f"w{c['w']:4d} h{c['h']:3d}   {'NEAR (in front)' if c['near'] else 'far (behind)'}")
    for s, x0, y0, w, h, why in skipped:
        print(f"   skip  px {s:6d}  x{x0:4d} y{y0:4d} w{w:4d} h{h:3d}   {why}")

    # ── the cut ──────────────────────────────────────────────────────────
    take = np.isin(lab, [c["i"] for c in kept])
    soft = ndimage.gaussian_filter(take.astype(np.float32), FEATHER)
    alpha = np.clip((soft - 0.35) / 0.45, 0, 1)          # feathered edge

    rgb = np.asarray(im).astype(np.uint8)
    out = []
    for c in kept:
        x0, y0, w, h = c["x"], c["y"], c["w"], c["h"]
        pad = 3
        X0, Y0 = max(0, x0 - pad), max(0, y0 - pad)
        X1, Y1 = min(W, x0 + w + pad), min(H, y0 + h + pad)
        sub = np.dstack([rgb[Y0:Y1, X0:X1],
                         (alpha[Y0:Y1, X0:X1] * 255).astype(np.uint8)])
        name = f"title-pcloud{len(out)}.webp"
        Image.fromarray(sub, "RGBA").save(BG / name, lossless=True)
        out.append({"file": name, "x": int(X0), "y": int(Y0),
                    "w": int(X1 - X0), "h": int(Y1 - Y0), "px": c["px"],
                    "near": bool(c["near"])})

    # ── the hole ─────────────────────────────────────────────────────────
    #
    # ⚠️ cv2.inpaint WAS TRIED FIRST AND LEFT VISIBLE GHOSTS. TELEA diffuses
    # colour inward and produces a SMOOTH blob, and this sky is dithered — so
    # every lifted cloud left a soft grey smear exactly its own shape. Same
    # failure the OPTIONS hole had on the road (see retexture() in
    # cut_still.py): "high-frequency energy 0.80 against the road's 4.35".
    #
    # A sky is an easier and more specific problem than a road, though. It is
    # a VERTICAL GRADIENT that is essentially constant along each row, so the
    # right fill is not a diffusion at all — it is that row's own colour.
    # Taken as the median of the real, untouched sky in the same row, it
    # carries the gradient exactly and cannot drift the way an offset can.
    #
    # Then the grain is BORROWED, not synthesised, for the reason cut_still.py
    # gives: this plate's dither is an ordered pattern and gaussian noise does
    # not look like it. The residual of a clean sky block (real sky minus its
    # own row medians) is tiled over the fill.
    fillmask = ndimage.binary_dilation(take, iterations=DILATE)
    rgbf = rgb.astype(np.float32)

    clean = sky & ~cloud & ~protect & ~fillmask

    # ⚠️ THE COLOUR IS A DIFFUSION AND THE GRAIN IS BORROWED — two different
    # jobs, and trying to do both with one trick failed twice.
    #
    #   inpaint alone      -> right colour, NO dither: a smooth grey smear in
    #                         the shape of every cloud lifted.
    #   row median alone   -> right dither, WRONG colour: this sky varies
    #                         horizontally as well as vertically (it lifts
    #                         toward the horizon and around the light), so one
    #                         median per row is the average of the whole row
    #                         and the fills came out visibly teal against the
    #                         blue they sat in.
    #
    # Smooth IS correct for the low frequencies — that is what a gradient is.
    # So take the colour from the inpaint, which follows both gradients and
    # matches locally at every edge, and put the plate's own dither back on
    # top of it. Same split as retexture() in cut_still.py.
    # pyramid_inpaint (cut_planes.py) rather than cv2.inpaint. TELEA
    # propagates inward FROM THE HOLE BOUNDARY, so on a hole 235px wide it
    # drags the cloud's own bright rim into the middle and leaves a mottled
    # patch. The push-pull pyramid pulls colour down to a coarse level and
    # pushes it back, which is exactly a smooth gradient and is what this
    # project already uses for the OPTIONS hole.
    low = pyramid_inpaint(rgb, fillmask).astype(np.float32)

    # Row medians are still what the GRAIN is measured against — the residual
    # of real sky about its own row is the dither, with the gradient removed.
    med = np.zeros((H, 3), np.float32)
    have = np.zeros(H, bool)
    for y in range(660):
        px = rgbf[y][clean[y]]
        if len(px) >= 12:
            med[y] = np.median(px, axis=0)
            have[y] = True
    idx = np.flatnonzero(have)
    for c in range(3):
        med[:660, c] = np.interp(np.arange(660), idx, med[idx, c])

    # Donor grain: the cleanest tall block of sky on the plate.
    best, bx = -1, 0
    for x in range(0, W - 120, 40):
        score = clean[40:620, x:x + 120].sum()
        if score > best:
            best, bx = score, x
    donor = rgbf[40:620, bx:bx + 120] - med[40:620, None, :]
    dh, dw = donor.shape[:2]

    # ⚠️ AND THE DONOR HAS TO BE LEVELLED, because no 120px column of this
    # plate is pure sky — whatever block wins still clips a cloud edge or a
    # spire, and those show up in the residual as huge excursions. Taken raw
    # the fill came out at 4.50 high-frequency energy against real sky's 2.30,
    # i.e. twice as grainy as what it was blending into. Outliers are clamped
    # to the dither's own range and then the whole thing is scaled to match.
    dclean = clean[40:620, bx:bx + 120]
    if dclean.sum() < 500:
        sys.exit("no clean sky to take grain from")
    # ⚠️ THE GRAIN MUST BE ZERO-MEAN OVER REAL SKY, or it is not grain, it is
    # a brightness offset wearing grain's clothes. No 120px column of this
    # plate is pure sky, so the donor block clips clouds — and a cloud's
    # residual about its row median is hugely POSITIVE. Tiled in, that lifted
    # every fill: measured rim deltas of +1 to +15 levels, all positive, on a
    # project whose accepted standard is 0.83. Clamping the magnitude did not
    # help because the clipped values were still mostly +lim.
    #
    # So: drop the grain everywhere the donor is not genuinely sky, and
    # subtract what is left so it averages to nothing.
    donor[~dclean] = 0
    donor -= donor[dclean].mean(axis=0)
    donor[~dclean] = 0
    lim = np.percentile(np.abs(donor[dclean]), 97)
    donor = np.clip(donor, -lim, lim)

    def energy(img, where):
        """Mean high-frequency energy — the same measure used to grade the
        OPTIONS hole, so the numbers are comparable across the project."""
        l = 0.2126 * img[..., 0] + 0.7152 * img[..., 1] + 0.0722 * img[..., 2]
        return float(np.abs(l - ndimage.uniform_filter(l, 5))[where].mean())

    # Calibrate against the FINISHED result rather than a proxy. "Deviation
    # from the row median" and "what a 5px high-pass sees" are not the same
    # quantity — matching the first left the fill at 1.01 against real sky's
    # 2.09, having previously overshot to 4.50 matching nothing at all. So
    # build it, measure it, and scale once by the ratio.
    target = energy(rgbf, clean & (np.arange(H)[:, None] < 620))

    def build(scale):
        out = rgbf.copy()
        out[ys, xs] = low[ys, xs] + donor[ys % dh, xs % dw] * scale
        return np.clip(out, 0, 255)

    ys, xs = np.where(fillmask)
    got = energy(build(1.0), fillmask)
    grain = 1.0 if got < 1e-6 else min(4.0, target / got)

    filled = build(grain)
    print(f"  grain x{grain:.2f}: fill {energy(filled, fillmask):.2f} "
          f"vs real sky {target:.2f}")
    filled = filled.astype(np.uint8)
    # ⚠️ FEATHER THE PATCH EDGE. A binary alpha means the inpainted sky butts
    # against the real sky along a hard line, and a hard line is visible even
    # when the colours either side match to under two levels — it reads as the
    # cut-out shape of the cloud that used to be there. Softening the boundary
    # dissolves it, the same fix the OPTIONS band needed.
    falpha = ndimage.gaussian_filter(fillmask.astype(np.float32), 2.0)
    falpha = np.clip((falpha - 0.15) / 0.7, 0, 1)
    falpha[fillmask] = 1.0                  # never thin the middle of a fill
    patch = np.dstack([filled, (falpha * 255).astype(np.uint8)])
    print(f"\nfill patch covers rows {ys.min()}..{ys.max()}, "
          f"cols {xs.min()}..{xs.max()}  (grain donor at x{bx})")
    Image.fromarray(patch, "RGBA").save(BG / "title-portrait-skyfill.webp",
                                        lossless=True)

    # ── the towers, so clouds can pass BEHIND them ───────────────────────
    #
    # Everything solid from the skyline down to the bottom of the sky band.
    # NOT inpainted and NOT cut out of the base: the base still holds the
    # towers, and this is the same pixels drawn back on top of the far clouds,
    # landing exactly over their own position. So nothing behind it is ever
    # revealed and there is no hole to fill — the trick that makes this cheap.
    #
    # It reaches to the FOOT of the plate rather than stopping at the sky
    # band, because a cloud drifting at y589 has towers below it as well as
    # beside it, and a card that stopped short would let one slide out over
    # the street.
    # ⚠️ THE REAL SILHOUETTE, NOT "EVERYTHING BELOW A PER-COLUMN SKYLINE".
    #
    # The first version filled each column from its skyline row downward, and
    # that skyline was minimum-filtered over 25 columns to be "conservative".
    # Both of those put SKY inside the towers card: the min-filter dragged
    # each spire's tip sideways across its 25 neighbours, and filling downward
    # swallowed every patch of open sky between and beside the buildings.
    #
    # Because the towers card draws over the far clouds, all of that invisible
    # sky ATE THEM. Client, exactly: "only behind buildings... and other white
    # clouds. But never behind the sky, former holes or patches."
    #
    # So the mask is simply what is actually painted there — not sky, not
    # cloud — which is the buildings themselves and nothing else. A cloud can
    # then only ever be hidden by something a person can see.
    # Sky is whatever the open air along the TOP of the frame can reach,
    # travelling through sky and cloud. Anything it cannot reach is enclosed,
    # and enclosed means masonry — which sorts the two hard cases apart on its
    # own: a lit window is walled in on every side and becomes tower, while a
    # gap between two towers still opens upward and stays sky.
    #
    # A plain colour key could not tell those apart. Closing it with a big
    # kernel and filling every hole (the first attempt) covered the windows
    # but swallowed 10.2% of the open sky in the skyline band with it.
    # Reachability plus a 3px close gets that to 4.4% while still covering
    # 93.4% of the masonry, and what is left is a pixel or two of halo on each
    # building's own edge.
    openable = sky | cloud | protect
    seed = np.zeros((H, W), bool)
    seed[0:3, :] = openable[0:3, :]
    sky_open = ndimage.binary_propagation(seed, mask=openable)
    towers = ~sky_open
    towers[660:, :] = True                  # below the skyline it is all street
    towers = ndimage.binary_closing(towers, np.ones((3, 3), bool))
    towers &= ~protect
    # Specks of "not sky" floating in open sky are dither, not architecture,
    # and each one would clip a little bite out of a passing cloud.
    tl, tn = ndimage.label(towers)
    if tn:
        keep = {i for i, sz in enumerate(ndimage.sum(towers, tl, range(1, tn + 1)), 1)
                if sz >= 400}
        towers = np.isin(tl, list(keep))
    tsoft = ndimage.gaussian_filter(towers.astype(np.float32), 0.6)
    talpha = np.clip((tsoft - 0.35) / 0.4, 0, 1)
    Image.fromarray(np.dstack([rgb, (talpha * 255).astype(np.uint8)]),
                    "RGBA").save(BG / "title-portrait-skyline.webp",
                                 lossless=True)
    print(f"skyline card: covers from row {int(skyline.min())} down, "
          f"{int(towers.sum())} px")

    json.dump({"srcW": W, "srcH": H,
               "skylineTop": int(skyline.min()),
               "clouds": out},
              open(BG / "title-portrait-clouds.json", "w"), indent=1)
    print(f"wrote {len(out)} sprites + skyfill + skyline"
          f" + title-portrait-clouds.json")


if __name__ == "__main__":
    main()
