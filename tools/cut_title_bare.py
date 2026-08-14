#!/usr/bin/env python3
"""The title painting with everything that FLIES IN taken out of it.

Client: "most definitely the background should appear on the intro screen,
and then all the other layers... background first then all the other layers."
And earlier, describing the same beat: "it should basically be like a street
and a blank skyline and then everything falls into place."

WHY THIS ASSET HAS TO EXIST. The intro could not do that before, and the
reason is measured: `title-portrait.webp` is the WHOLE painting, and every
card cut from it is still sitting in it (identical-to-base 0.93-1.00 for all
seven object cards, 22.9% of the plate between them). So fading the plate up
FIRST would show WILL HILL, PLAYER ONE, the signs, the hero and the pole
already in place — and then fly a second copy of each one in on top. That
exact bug shipped once already, as two PLAYER ONEs, which is why the old
timing held the plate back until the last card had landed and the assembly
therefore played out over black.

This writes `title-portrait-bare.webp`: the same painting with those seven
objects removed and the background closed behind them — the empty street and
blank skyline the client asked to see first.

⚠️ IT IS ONLY EVER DRAWN DURING THE INTRO. title.js swaps back to the real
plate the moment the assembly ends, so a filled region is on screen for at
most the second or so before its own card lands on top of it and covers it
completely. The fill has to be good enough to read as background at a glance,
not good enough to replace the artwork.

THE FILL, in order of preference per hole:
  1. A DONOR STRIP FROM THE SAME ROWS. This painting is horizontally
     self-similar — sky bands, tree canopy, guardrail, road all run across it
     — so a clean window at the same height is usually the real texture,
     not an approximation of it. Same lesson as the stage clouds: an
     interpolated fill smears and a 2D diffusion invents haze, while real
     pixels at the right altitude just look like the painting.
  2. The push-pull pyramid (cut_planes.pyramid_inpaint) wherever no clean
     donor of that width exists at any nearby row.
Either way the seam is then corrected in the GRADIENT DOMAIN: the error is
sampled on the hole's boundary and diffused inward, so the patch's tone bends
to meet its surroundings instead of printing an outline.

    python3 tools/cut_title_bare.py            # dry run + preview
    python3 tools/cut_title_bare.py --write
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
BG = ROOT / 'src' / 'assets' / 'backgrounds'
OUT = Path('/tmp/claude-0/-home-user-will-hill-player-one-game/'
           'cbc3ff9f-7391-51ef-9349-17836bad5bc5/scratchpad/title')

sys.path.insert(0, str(ROOT / 'tools'))
from cut_planes import pyramid_inpaint  # noqa: E402  the project's own fill

# ⚠️ ONLY THE LETTERING COMES OUT — AND THAT IS A DESIGN DECISION, NOT A
# LIMITATION I GAVE UP AT.
#
# The first pass removed all seven flying cards. It measured badly and looked
# worse: 23% of the plate gone, 88k px with no donor at any nearby row, a rim
# delta of 31.65 levels (invisible is under ~2), and the signs and hero came
# back as dark smeared rectangles hanging in the trees. Those three objects
# sit against the most detailed part of the painting — canopy, guardrail, wet
# road — and nothing short of repainting puts believable background behind
# them.
#
# So the split follows the client's own words instead: "the background should
# appear on the intro screen, and then all the other layers." The BACKGROUND
# is the street scene — sky, skyline, signs, hero, pole, road — and it now
# arrives first, whole, as the painting he approved. The LAYERS that fall into
# place on top of it are the title lettering: WILL HILL:, then PLAYER ONE with
# both stars. Those sit against open sky and skyline, where a donor strip from
# the same rows IS the real texture, so they lift cleanly.
OBJECTS = ['wordmark', 'logo', 'stars']

# Any coverage at all counts as the card's ground. Using the opaque core
# instead would leave the card's feathered rim compositing over filled
# background, printing a faint halo around each landed object.
ALPHA_FLOOR = 8


def hole_mask(rgb):
    """The cards' own coverage, GROWN THROUGH THEIR KEYLINES.

    ⚠️ THE CARD MASK IS THE LETTER FACES ONLY. Filling exactly that left every
    letterform standing in the sky as a hollow black outline — the painting
    draws WILL HILL: and PLAYER ONE with a heavy dark keyline and drop
    shadow, and none of it is inside the cut. Since the keyline is attached to
    the faces and is far darker than anything else up there (sky is bright
    blue, the outline is near-black), the mask is grown one pixel at a time
    into DARK neighbours only: that follows the outline all the way round,
    including the shadow, and stops dead at the sky.
    """
    shape = rgb.shape[:2]
    m = np.zeros(shape, bool)
    for k in OBJECTS:
        a = np.array(Image.open(BG / f'titlep-{k}.webp').convert('RGBA'))
        if a.shape[:2] != shape:
            raise SystemExit(f'titlep-{k}.webp is not full-frame')
        m |= a[..., 3] > ALPHA_FLOOR

    v = rgb.max(axis=2) / 255.0
    dark = v < 0.42
    for _ in range(18):
        grown = ndimage.binary_dilation(m) & (dark | m)
        if (grown == m).all():
            break
        m = grown
    # One clean pixel past the outline, to take the anti-aliased edge with it.
    return ndimage.binary_dilation(m, iterations=1)


def donor_fill(rgb, hole):
    """Row-band donor strips, with a pyramid fallback. Returns (out, stats)."""
    H, W, _ = rgb.shape
    out = rgb.astype(float).copy()
    clean = ~ndimage.binary_dilation(hole, iterations=3)
    got_donor = 0
    got_pyr = 0
    pyr_needed = np.zeros((H, W), bool)

    for y in range(H):
        xs = np.where(hole[y])[0]
        if not len(xs):
            continue
        runs = []
        start = prev = xs[0]
        for x in xs[1:]:
            if x != prev + 1:
                runs.append((start, prev))
                start = x
            prev = x
        runs.append((start, prev))

        for x0, x1 in runs:
            need = x1 - x0 + 1
            best = None
            # Search nearby rows for a clean window this wide. Same row first;
            # a small vertical step is cheap here because the painting's bands
            # are horizontal, but a big one would fetch the wrong altitude.
            for dy in sorted(range(-26, 27), key=abs):
                yy = y + dy
                if not (0 <= yy < H):
                    continue
                ok = clean[yy]
                if not ok.any():
                    continue
                run = 0
                for x in range(W):
                    if ok[x]:
                        run += 1
                        if run >= need:
                            lo = x - need + 1
                            cost = abs(lo - x0) + abs(dy) * 14
                            if best is None or cost < best[0]:
                                best = (cost, yy, lo)
                    else:
                        run = 0
                if best is not None and abs(dy) >= 6 and best[0] < 400:
                    break
            if best is None:
                pyr_needed[y, x0:x1 + 1] = True
                got_pyr += need
                continue
            _, yy, lo = best
            out[y, x0:x1 + 1] = rgb[yy, lo:lo + need]
            got_donor += need

    if pyr_needed.any():
        low = pyramid_inpaint(np.clip(out, 0, 255).astype(np.uint8), pyr_needed)
        out[pyr_needed] = low[pyr_needed].astype(float)

    return out, {'donor_px': got_donor, 'pyramid_px': got_pyr}


def gradient_fix(orig, filled, hole):
    """Diffuse the boundary error inward so the patch has no outline.

    Known only on the rim (where filled meets untouched painting), pushed
    into the hole by the same push-pull pyramid. Straight from the title
    cloud work — a patch that is individually correct still reads as a patch
    if its edge steps.
    """
    rim = ndimage.binary_dilation(hole, iterations=1) & ~hole
    if not rim.any():
        return filled
    err = np.zeros_like(filled)
    err[rim] = orig.astype(float)[rim] - filled[rim]
    spread = pyramid_inpaint(np.clip(err + 128, 0, 255).astype(np.uint8), ~rim)
    spread = spread.astype(float) - 128
    out = filled.copy()
    out[hole] = filled[hole] + spread[hole]
    return np.clip(out, 0, 255)


def main():
    write = '--write' in sys.argv
    OUT.mkdir(parents=True, exist_ok=True)

    src = Image.open(BG / 'title-portrait.webp').convert('RGB')
    rgb = np.array(src)
    H, W, _ = rgb.shape
    hole = hole_mask(rgb)
    print(f'title-portrait {W}x{H}: removing {hole.sum()} px '
          f'({100 * hole.sum() / (H * W):.1f}% of the plate)')

    filled, stats = donor_fill(rgb, hole)
    print(f'  donor strips {stats["donor_px"]} px, pyramid {stats["pyramid_px"]} px')
    fixed = gradient_fix(rgb, filled, hole)

    # SETTLE THE PATCHWORK. Donor strips are real pixels but neighbouring rows
    # fetch from different places, so their joins print as faint rectangles in
    # what should be smooth sky. Sky is the one texture where blurring is not
    # a loss — it is genuinely a soft gradient — so the interior of the hole
    # (never its rim, which is already matched) gets a gentle smooth, and the
    # plate's own fine grain is put back on top so it does not sit dead flat
    # inside dithered artwork.
    # ⚠️ AND NO SYNTHETIC GRAIN ON TOP. Adding noise matched to the sky band's
    # high-pass turned the filled letterforms into visible static — the band's
    # sigma is set by its clouds and skyline edges, not by the flat sky the
    # hole actually sits in, so the noise came out far too loud. The smooth
    # fill alone is the better answer here: this region IS a soft gradient.
    interior = ndimage.binary_erosion(hole, iterations=2)
    if interior.any():
        smooth = ndimage.gaussian_filter(fixed, (3.0, 3.0, 0))
        fixed[interior] = smooth[interior]

    # How loud is the join? Same metric the cloud work used: mean absolute
    # difference across the hole's rim, in levels. Under ~2 is invisible.
    # The seam, honestly measured: every pixel just OUTSIDE the hole against
    # the filled pixel it touches. Comparing a region to a global mean (the
    # first version) measures the region's own contrast, not the join, and
    # reported 39.8 on a fill whose join was fine.
    rim = ndimage.binary_dilation(hole, iterations=1) & ~hole
    inside = np.zeros_like(rim)
    for sh, ax in ((1, 0), (-1, 0), (1, 1), (-1, 1)):
        nb = np.roll(hole, sh, axis=ax) & rim
        inside |= nb
    pairs = []
    for sh, ax in ((1, 0), (-1, 0), (1, 1), (-1, 1)):
        src = np.roll(fixed, -sh, axis=ax)
        sel = rim & np.roll(hole, sh, axis=ax)
        if sel.any():
            pairs.append(np.abs(fixed[sel] - src[sel]).mean())
    delta = float(np.mean(pairs)) if pairs else 0.0
    print(f'  seam delta {delta:.2f} levels (under ~2 is invisible)')

    bare = np.clip(fixed + 0.5, 0, 255).astype(np.uint8)
    Image.fromarray(bare).save(OUT / 'title-portrait-bare.png')
    scan = rgb.copy()
    scan[hole] = [255, 60, 60]
    Image.fromarray(scan).save(OUT / 'title-bare-scan.png')

    if write:
        Image.fromarray(bare).save(BG / 'title-portrait-bare.webp',
                                   quality=95, method=6)
        print('  wrote title-portrait-bare.webp')
    else:
        print('  dry run — previews in', OUT)


if __name__ == '__main__':
    main()
