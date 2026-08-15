#!/usr/bin/env python3
"""Move every liftable cloud OFF the day base plates and ONTO the clouds card.

Client, from the live game: a seam wandering the sky, and "clouds moving into
clouds". Both have the same cause. The day `clouds` cards drift (weather), but
they were cut as a BAND OF SKY WITH CLOUDS IN IT, and the base plate still
carries its own copy of every one of those clouds:

  * the card's opaque sky ends somewhere, and wherever that alpha edge lands
    on screen, card-sky meets base-sky at a different tone — a vertical seam
    that travels with the drift;
  * after a minute of drift the card's clouds sit far from the base's baked
    copies, so every cloud in the scene prints twice.

THE SPLIT THIS MAKES. For each cloud blob in the base's sky:
  * LIFTED — free-floating clouds, and clouds crossed only by THIN lines
    (power wires): removed from the base (sky filled back in), drawn on the
    card as a puff on transparency, the wire scar healed on the card copy so
    the puff can drift without carrying a baked-in gap. The card ends up with
    NO sky pixels at all — a drifting puff never shows an edge.
  * LEFT BAKED — clouds meaningfully occluded by structure (towers, signs):
    they stay in the base, static, behind their buildings. Lifting one would
    give the drifting copy a building-shaped bite. A drifting card puff
    passing in front of a baked one reads as layered weather, not a glitch,
    because after the scrub they are different clouds.

THE FILL is the title screen's lesson scaled down: per-row horizontal
interpolation between the nearest real sky pixels (day skies vary far more
vertically than horizontally), zero-mean grain matched to the plate's own sky
noise so the patch doesn't sit flat inside pixel-art dither, and a coarse
vertical blend where a row has sky on only one side.

Dry run writes previews + per-blob stats and touches nothing:
    python3 tools/scrub_stage_clouds.py eav-day
Write into src/ (base, clouds card) and print the new span for stages.js:
    python3 tools/scrub_stage_clouds.py eav-day --write
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
BG = ROOT / 'src' / 'assets' / 'backgrounds'
OUT = Path('/tmp/claude-0/-home-user-will-hill-player-one-game/'
           'cbc3ff9f-7391-51ef-9349-17836bad5bc5/scratchpad/clouds')

# Per-plate config. sky_top_frac bounds the search (nothing below it is ever
# sky); the rest are the same hysteresis keys the title cutter used — a
# strict core so noise never seeds a blob, a weak halo so soft cloud edges
# join their core instead of being sliced off.
CFG = {
    'eav-day': {
        'base': 'eav-day-base.webp', 'card': 'eav-day-clouds.webp',
        'sky_frac': 0.55,
    },
    'edgewood-day': {
        'base': 'edgewood-day-base.webp', 'card': 'edgewood-day-clouds.webp',
        'sky_frac': 0.40,
    },
    'l5p-day': {
        'base': 'l5p-day-base.webp', 'card': 'l5p-day-clouds.webp',
        'sky_frac': 0.40,
    },
    'underground-day': {
        'base': 'underground-day-base.webp', 'card': 'underground-day-clouds.webp',
        'sky_frac': 0.30,
    },
}

MIN_BLOB = 40          # px — below this it's dither, leave it alone
OCCLUDED_FRAC = 0.14   # blob borders structure more than this -> stays baked
WIRE_MAX_THICK = 4     # px — dark runs no thicker than this inside a puff heal


def hsv(rgb):
    r, g, b = rgb[..., 0] / 255.0, rgb[..., 1] / 255.0, rgb[..., 2] / 255.0
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    return s, mx  # saturation, value


def sky_and_clouds(rgb, sky_rows):
    """Masks over the full frame: (sky, strict cloud, weak cloud).

    ⚠️ THE FLOOD TRAVELS THROUGH BLUE ONLY. The first pass let it travel
    through cloud-ish pixels too, and on EAV it crossed the Swifty sign's
    white frame into the sign's blue face — at which point the seven white
    letters of CAR WASH scanned as seven clouds, ring-clear and ready to
    lift off the sign and drift across Atlanta. Blue-only reachability
    cannot enter an enclosed sign face, and clouds do not need to be
    reachable themselves — being RINGED by reachable sky is their test.
    """
    s, v = hsv(rgb)
    r, g, b = rgb[..., 0].astype(int), rgb[..., 1].astype(int), rgb[..., 2].astype(int)
    # ⚠️ BRIGHT ENOUGH TO BE SKY, not merely blue. A building's shadowed face
    # is painted dark blue and meets open sky at its roofline, so a flood that
    # only asks "is it blue" pours in at the roof and runs the whole height of
    # the shadow — marking the strip as sky, leaving it out of the structure
    # overlay, and letting clouds show straight down it. That is the bug the
    # client found on the title screen ("that long shadow strip going down the
    # building is treating that like it's something separate"), and this file
    # shares the flood, so it shares the bug. Measured on the title plate: the
    # two populations do not overlap — shadow below 0.40, real sky 0.596 to
    # 0.694 — so 0.50 sits in the gap.
    SKY_MIN_V = 0.50
    blue = (b > r + 12) & (b > g + 4) & (v > SKY_MIN_V)
    cloud_strict = (v > 0.80) & (s < 0.16)
    cloud_weak = (v > 0.62) & (s < 0.30)
    zone = np.zeros(v.shape, bool)
    zone[:sky_rows] = True
    # ⚠️ ERODE BEFORE FLOODING. Anti-aliased pixels where a sign frame meets
    # both sky and sign face form 1px blue bridges; un-eroded, the flood
    # crossed one on the Swifty sign and the face scanned as sky (which is
    # how CAR WASH became seven clouds even with blue-only travel). Eroding
    # by 1 cuts every 1px bridge; a single constrained dilation afterwards
    # recovers the true sky rim without re-crossing a barrier, because one
    # step cannot flood a face — only re-touch the bridge pixel itself.
    core = ndimage.binary_erosion(blue & zone & ~cloud_weak, iterations=1)
    lbl, _ = ndimage.label(core)
    # Seed from the top FOUR rows: erosion treats the image border as
    # background, so row 0 of the core is always empty and seeding from it
    # alone finds nothing at all (measured: 0 cloud blobs on a sky full of
    # them).
    top_ids = np.unique(lbl[0:4][lbl[0:4] > 0])
    sky = np.isin(lbl, top_ids)
    sky = ndimage.binary_dilation(sky, iterations=1) & blue & zone
    return sky, cloud_strict & zone, cloud_weak & zone


# A blob is only a cloud at all if most of its ring is open sky. White sign
# letters ring on sign paint (0.00 sky), bright tower faces ring on tower
# (low sky) — both fall out here rather than needing to be known about.
IN_SKY_FRAC = 0.50


def classify(rgb, sky, strict, weak):
    """Hysteresis blobs + in-sky test + occlusion split -> (lift, baked)."""
    _, v = hsv(rgb)
    lbl, n = ndimage.label(weak)
    keep = np.zeros_like(weak)
    if n:
        has_core = ndimage.maximum(strict, lbl, np.arange(1, n + 1))
        sizes = ndimage.sum(weak, lbl, np.arange(1, n + 1))
        ok = (has_core > 0) & (sizes >= MIN_BLOB)
        keep = np.isin(lbl, np.arange(1, n + 1)[ok])
    lbl, n = ndimage.label(keep)
    lift = np.zeros_like(keep)
    baked = np.zeros_like(keep)
    stats = []
    W = keep.shape[1]
    for i in range(1, n + 1):
        m = lbl == i
        ring = ndimage.binary_dilation(m, iterations=2) & ~m
        ring_sky = (ring & sky).sum() / max(1, ring.sum())
        if ring_sky < IN_SKY_FRAC:
            continue  # not a cloud — a bright thing on a structure
        ys, xs = np.where(m)
        # ⚠️ AND THE SKY AROUND IT MUST BE THE SKY'S OWN TONE. The Swifty
        # sign's blue face meets open sky with no frame, so the flood mask
        # honestly cannot tell them apart — which made the white CAR WASH
        # letters ring-sky 0.9 "clouds". But the face is a darker blue than
        # the real sky at those rows. Reference = the sky's median value on
        # the blob's own rows OUTSIDE its neighbourhood; a ring that reads
        # ≥0.09 darker is a painted pocket, not sky, and the blob is a
        # letter, not a cloud.
        hood = ndimage.binary_dilation(m, iterations=12)
        y0, y1 = max(0, ys.min() - 2), min(v.shape[0], ys.max() + 3)
        ref_px = v[y0:y1][sky[y0:y1] & ~hood[y0:y1]]
        ring_v = np.median(v[ring & sky]) if (ring & sky).any() else 0
        if len(ref_px) > 40 and ring_v < np.median(ref_px) - 0.09:
            continue  # its "sky" is a pocket of sign paint
        # A blob touching the plate's x-edge is CHOPPED by the frame. Lifting
        # it would send a straight-edged half-cloud drifting across the sky;
        # it stays baked and the wrap-edge pass deals with the chop.
        at_edge = xs.min() == 0 or xs.max() == W - 1
        # Structure in the ring = occluder. A wire crossing a puff is a
        # sliver, far under the threshold; a tower biting into it is not.
        structure = ring & ~sky & ~keep
        frac = structure.sum() / max(1, ring.sum())
        ok = frac < OCCLUDED_FRAC and not at_edge
        (lift if ok else baked)[m] = True
        stats.append((i, int(m.sum()), float(ring_sky), float(frac),
                      (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())),
                      'LIFT' if ok else ('baked-edge' if at_edge and frac < OCCLUDED_FRAC else 'baked')))
    return lift, baked, stats


def fill_sky(rgb, mask, sky):
    """Fill mask pixels with pyramid-inpainted tone + transplanted dither.

    Two 1D attempts failed before this: endpoint lerp read as a smooth smear
    inside pixel-art dither, and row-wise donor copies striped (adjacent rows
    pulled donors from different places; measured on EAV as hard, ruler-flat
    streaks through the fill). The 2D route the title screen already proved:
      1. push-pull pyramid (cut_planes.pyramid_inpaint) lays down the smooth
         low-frequency sky matching the hole's whole boundary;
      2. the dither comes back as TEXTURE TRANSPLANT — the high-pass of a
         clear-sky patch, tiled with feathered joins, so the fill carries the
         plate's own ordered grain rather than white noise.
    """
    H, W, _ = rgb.shape
    out = rgb.astype(float).copy()
    # Low frequency = each row's OWN clear-sky tone. The pyramid diffused
    # the pale haze of the plate's top rows down into the hole and the fill
    # read as one more big soft cloud (measured on EAV blob 1). A day sky's
    # tone is a function of altitude — of the ROW — so the reference is the
    # median of the row's clear sky (±3 rows), smoothed vertically.
    clear_ref = sky & ~ndimage.binary_dilation(mask, iterations=3)
    ref = np.zeros((H, 3))
    have = np.zeros(H, bool)
    for y in range(H):
        y0, y1 = max(0, y - 3), min(H, y + 4)
        px = rgb[y0:y1][clear_ref[y0:y1]]
        if len(px) > 30:
            ref[y] = np.median(px, axis=0)
            have[y] = True
    idx = np.where(have)[0]
    if not len(idx):
        return rgb
    for y in range(H):
        if not have[y]:
            ref[y] = ref[idx[np.argmin(np.abs(idx - y))]]
    ref = ndimage.gaussian_filter1d(ref, 4, axis=0)
    ys_m, xs_m = np.where(mask)
    out[ys_m, xs_m] = ref[ys_m]

    # Largest clear-sky window to steal grain from: slide a coarse grid,
    # keep the biggest all-sky rectangle found (cheap and good enough).
    clear = sky & ~ndimage.binary_dilation(mask, iterations=3)
    best = None
    for ph, pw in [(48, 96), (32, 64), (24, 48)]:
        ys, xs = np.where(clear)
        if not len(ys):
            break
        for y0 in range(max(0, ys.min()), min(H - ph, ys.max()), max(8, ph // 3)):
            row_ok = clear[y0:y0 + ph]
            colsum = row_ok.all(axis=0)
            run = 0
            for x in range(W):
                run = run + 1 if colsum[x] else 0
                if run >= pw:
                    best = (y0, x - pw + 1, ph, pw)
                    break
            if best:
                break
        if best:
            break
    if best:
        y0, x0, ph, pw = best
        patch = rgb[y0:y0 + ph, x0:x0 + pw].astype(float)
        grain = patch - ndimage.gaussian_filter(patch, (5, 5, 0))
        rng = np.random.default_rng(11)
        acc = np.zeros((H, W, 3))
        wsum = np.zeros((H, W, 1))
        ramp = np.minimum(np.linspace(0, 1, ph)[:, None] * 4, 1)
        ramp = np.minimum(ramp, ramp[::-1])
        ramp2 = np.minimum(np.linspace(0, 1, pw)[None, :] * 4, 1)
        ramp2 = np.minimum(ramp2, ramp2[:, ::-1])
        wpatch = (ramp * ramp2)[..., None]
        ys, xs = np.where(mask)
        for ty in range(max(0, ys.min() - ph), ys.max() + 1, ph // 2):
            for tx in range(max(0, xs.min() - pw), xs.max() + 1, pw // 2):
                oy = int(rng.integers(0, ph // 2))
                ox = int(rng.integers(0, pw // 2))
                gy = np.roll(np.roll(grain, oy, 0), ox, 1)
                y1, x1 = min(ty + ph, H), min(tx + pw, W)
                acc[ty:y1, tx:x1] += (gy * wpatch)[: y1 - ty, : x1 - tx]
                wsum[ty:y1, tx:x1] += wpatch[: y1 - ty, : x1 - tx]
        gm = wsum[..., 0] > 0
        acc[gm] /= wsum[gm]
        out[mask] += acc[mask]

    # A one-pixel cross-blend on the hole's boundary hides any residual step.
    edge = ndimage.binary_dilation(mask, iterations=1) & ~mask
    soft = ndimage.uniform_filter(out, size=(3, 3, 1))
    out[edge] = out[edge] * 0.5 + soft[edge] * 0.5
    return np.clip(out + 0.5, 0, 255).astype(np.uint8)


def _runs(xs):
    runs = []
    start = prev = xs[0]
    for x in xs[1:]:
        if x != prev + 1:
            runs.append((start, prev))
            start = x
        prev = x
    runs.append((start, prev))
    return runs


def heal_wires(rgb, blob):
    """Rebuild thin dark scars (wires) inside a lifted puff, on the card copy.

    Closing bridges everything WIRE_MAX_THICK px thin — wire scars, but also
    the blue sky pockets between a cluster's lobes. Only the DARK bridges are
    scars; a blue pocket is sky and must stay transparent, or the drifting
    puff carries rectangles of the wrong sky with it (seen on the first EAV
    card: blue webbing woven through the big cluster). So the closed area is
    filtered back to non-blue pixels before anything is painted.
    """
    closed = ndimage.binary_closing(blob, iterations=WIRE_MAX_THICK)
    r, g, b = (rgb[..., 0].astype(int), rgb[..., 1].astype(int),
               rgb[..., 2].astype(int))
    blueish = (b > r + 8) & (b > g + 2)
    scar = closed & ~blob & ~blueish
    out = rgb.astype(float).copy()
    if scar.any():
        med = ndimage.median_filter(out, size=(7, 7, 1))
        for _ in range(3):  # widen the median's reach for fat scars
            out[scar] = med[scar]
            med = ndimage.median_filter(out, size=(7, 7, 1))
    return np.clip(out, 0, 255).astype(np.uint8), blob | scar


def main():
    name = sys.argv[1] if len(sys.argv) > 1 else 'eav-day'
    write = '--write' in sys.argv
    cfg = CFG[name]
    OUT.mkdir(parents=True, exist_ok=True)

    base_im = Image.open(BG / cfg['base']).convert('RGB')
    rgb = np.array(base_im)
    H, W, _ = rgb.shape
    sky_rows = int(H * cfg['sky_frac'])

    sky, strict, weak = sky_and_clouds(rgb, sky_rows)
    lift, baked, stats = classify(rgb, sky, strict, weak)
    print(f'{name}: {len(stats)} cloud blobs '
          f'({sum(1 for s in stats if s[5] == "LIFT")} lifted, '
          f'{sum(1 for s in stats if s[5] != "LIFT")} left baked)')
    for i, size, rsky, frac, bbox, verdict in stats:
        print(f'  blob {i:2d}  {size:6d}px  ring-sky {rsky:.2f}  '
              f'structure-ring {frac:.2f}  {bbox}  {verdict}')

    # ── THE SKIRT ────────────────────────────────────────────────────────
    # A painted cloud fades into sky over a 10-20px gradient skirt that no
    # absolute threshold reaches — scrubbing the thresholded blob left thin
    # pale arcs of the old silhouette behind (measured twice on EAV blob 1,
    # at dilation 2 and again at 5). The skirt is found RELATIVELY instead:
    # every pixel measurably off its own row's clear-sky tone, reachable
    # from a lifted blob through pale unsaturated pixels, belongs to the
    # cloud. The same distance then IS the card's alpha, so the puff drifts
    # with its true soft edge instead of a uniform feather.
    s_all, v_all = hsv(rgb)
    clear_for_ref = sky & ~ndimage.binary_dilation(lift | baked, iterations=3)
    H2 = rgb.shape[0]
    ref = np.zeros((H2, 3))
    have = np.zeros(H2, bool)
    for y in range(H2):
        y0, y1 = max(0, y - 3), min(H2, y + 4)
        px = rgb[y0:y1][clear_for_ref[y0:y1]]
        if len(px) > 30:
            ref[y] = np.median(px, axis=0)
            have[y] = True
    idx_h = np.where(have)[0]
    for y in range(H2):
        if not have[y] and len(idx_h):
            ref[y] = ref[idx_h[np.argmin(np.abs(idx_h - y))]]
    ref = ndimage.gaussian_filter1d(ref, 4, axis=0)
    dist = np.abs(rgb.astype(float) - ref[:, None, :]).max(axis=2)

    healed, closed = heal_wires(rgb, lift)
    passable = (dist > 7) & (v_all > 0.55) & (s_all < 0.35) \
        & ~ndimage.binary_dilation(baked, iterations=2)
    grown = closed.copy()
    for _ in range(24):
        nxt = ndimage.binary_dilation(grown) & (passable | closed)
        if (nxt == grown).all():
            break
        grown = nxt

    alpha = np.clip((dist - 6) / 28.0, 0, 1) ** 0.8
    alpha[closed] = 1.0
    alpha[~grown] = 0.0
    alpha = ndimage.gaussian_filter(alpha, 0.8)
    card = np.dstack([healed, (alpha * 255 + 0.5).astype(np.uint8)])

    # The base: everything the card now owns becomes sky again.
    scrub = ndimage.binary_dilation(grown, iterations=2)
    base_new = fill_sky(rgb, scrub, sky)

    prev = rgb.copy()
    prev[lift] = [255, 60, 60]
    prev[baked] = [255, 220, 60]
    Image.fromarray(prev[:sky_rows + 40]).save(OUT / f'{name}-scan.png')
    Image.fromarray(base_new[:sky_rows + 40]).save(OUT / f'{name}-filled.png')
    over = np.zeros((H, W, 4), np.uint8)
    over[..., :3] = 30
    over[..., 3] = 255
    comp = Image.alpha_composite(Image.fromarray(over),
                                 Image.fromarray(card)).convert('RGB')
    comp = np.array(comp)
    Image.fromarray(comp[:sky_rows + 40]).save(OUT / f'{name}-card.png')

    # ── THE SKY-STRUCTURE OVERLAY ────────────────────────────────────────
    # A lifted cloud DRIFTS, and the card deck draws over the base — so a
    # puff crossing the utility poles would cover their wires, a far cloud
    # eclipsing near structure. The overlay is every non-sky, non-cloud
    # pixel of the sky band that no OTHER card already owns (those draw
    # after the clouds anyway), re-painted above the drifting puffs.
    #
    # It is declared at depth 0.5 — BASE_DEPTH — ON PURPOSE: cardParallax at
    # the base's own depth is the base's own offset, so the overlay sits on
    # its base copy to the pixel, forever, by construction. It has no depth
    # of its own to express; its entire job is draw order.
    others = np.zeros((H, W), bool)
    stem = cfg['card'].replace('-clouds.webp', '')
    for f in sorted(BG.glob(f'{stem}-*.webp')):
        if f.name in (cfg['base'], cfg['card']) or f.name.endswith('-skystruct.webp'):
            continue
        im = Image.open(f)
        if im.size != (W, H) or 'A' not in im.getbands():
            continue
        # >32, not >128: a card's feathered rim is still that card's ground.
        others |= np.array(im.getchannel('A')) > 32
    # Dilated, because carded things SWAY — a static overlay copy of a tree
    # crown would double against the swaying card copy at full amplitude.
    others = ndimage.binary_dilation(others, iterations=5)
    band = np.zeros((H, W), bool)
    band[:sky_rows] = True
    # Everything blue-ish stays OUT of the overlay even where the flood
    # never reached it: sky enclosed between towers and under wire runs is
    # still sky, and an overlay that owned it would clip a passing puff
    # along invisible rectangle edges — the title towers bug all over again.
    s2, v2 = hsv(rgb)
    r2, g2, b2 = (rgb[..., 0].astype(int), rgb[..., 1].astype(int),
                  rgb[..., 2].astype(int))
    blueish = (b2 > r2 + 8) & (b2 > g2 + 2)
    cloudish = (v2 > 0.60) & (s2 < 0.32)
    # Wires AA'd against bright sky come out blue-tinted, so the hue rule
    # alone dropped them — and the wires are half the overlay's point. A
    # pixel clearly DARKER than sky is structure whatever its hue.
    darkline = v2 < 0.55
    struct = (band & (darkline | ~blueish)
              & ~ndimage.binary_dilation(cloudish, iterations=2)
              & ~others & ~scrub)
    # Drop lone specks (dither survivors) but keep wires: wires are long.
    lbl2, n2 = ndimage.label(struct, structure=np.ones((3, 3)))
    if n2:
        sizes2 = ndimage.sum(struct, lbl2, np.arange(1, n2 + 1))
        struct = np.isin(lbl2, np.arange(1, n2 + 1)[sizes2 >= 12])
    sa = ndimage.gaussian_filter(struct.astype(float), 0.6)
    sa = np.clip((sa - 0.25) / 0.5, 0, 1)
    skystruct = np.dstack([rgb, (sa * 255).astype(np.uint8)])
    Image.fromarray(np.array(Image.alpha_composite(
        Image.fromarray(over), Image.fromarray(skystruct)).convert('RGB'))[:sky_rows + 40]
    ).save(OUT / f'{name}-skystruct.png')

    def spanof(a):
        ys2, xs2 = np.where(a[..., 3] > 8)
        if not len(xs2):
            return (0.0, 0.0)
        return (round(xs2.min() / W, 3), round(min(1.0, (xs2.max() + 1) / W), 3))

    span = spanof(card)
    sspan = spanof(skystruct)
    print(f'  new clouds span for stages.js: [{span[0]:.3f}, {span[1]:.3f}]')
    print(f'  skystruct card span:           [{sspan[0]:.3f}, {sspan[1]:.3f}]  '
          f'({int((skystruct[..., 3] > 8).sum())} px)')

    if write:
        Image.fromarray(base_new).save(BG / cfg['base'], quality=95, method=6)
        Image.fromarray(card).save(BG / cfg['card'], quality=95, method=6)
        sspath = cfg['card'].replace('-clouds.webp', '-skystruct.webp')
        Image.fromarray(skystruct).save(BG / sspath, quality=95, method=6)
        print(f'  wrote {cfg["base"]}, {cfg["card"]}, {sspath}')
    else:
        print('  dry run — previews in', OUT)


if __name__ == '__main__':
    main()
