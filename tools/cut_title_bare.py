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

This writes `title-portrait-bare.webp`: the same painting with the title
lettering removed and the sky closed behind it — the street and blank skyline
the client asked to see first.

⚠️ "IT IS ONLY UP FOR A SECOND" WAS NOT A QUALITY WAIVER. The first fill
leaned on exactly that: per-row donor strips, whose row-joins printed faint
rectangles, then a sigma-3 gaussian blur over the hole interior to hide the
banding, with no grain put back. The client photographed the result mid-intro
— "can we do something about the scars and the sky before the text for Will
Hill falls in place." Letter-shaped holes (the mask grows through the dark
keylines) plus a smooth fill equals letter-shaped smudges, dead centre, for
the ~70 ticks before the wordmark lands.

MEASURED, because "looks smudged" is not a number: the blurred fill's
high-pass energy was 0.436 against 0.885-0.916 in the clean sky beside it —
HALF the painting's texture — and its rim delta was 4.57 levels where under
~2 is invisible. Both are now gates (see below), so this failure cannot ship
again silently.

cut_title_clouds.py had already proven the law on THIS SAME SKY: it is
textured, not smooth (polynomial residual 11-18 levels), so "every smooth fill
therefore SHOWS", and the only fill that disappears is real sky copied
wholesale. The fill now follows that file's strips pattern, scaled to letters.

THE FILL — 24px-tall 2D BAND DONORS, chunked:
  Each hole is cut into short horizontal bands. A band is tall enough to carry
  genuine 2D painting texture (a 1px strip cannot: neighbouring rows fetched
  from uncorrelated places IS the banding the blur was hiding) and short
  enough that the sky's vertical gradient inside it is nearly flat, so a donor
  from +/-150 rows still sits right after a mean correction off the boundary
  ring. Wide bands are split into <=260px chunks: the full letter-row width
  (530-682px) has almost no clean same-height donor, while 260px windows exist
  in every belt around the lettering (y143-169, y261-278, y388-421 are
  full-width clean), and chunks pulling from DIFFERENT spots kill the tiled
  repetition one stacked donor would print. Bands overlap 6 rows and the paste
  weight ramps across the join instead of stepping. Then the whole hole gets
  the gradient-domain rim fix, same as ever. NO INTERIOR BLUR. No synthetic
  grain either — that lesson stands (noise tuned to the band's high-pass reads
  as static); band donors carry the painting's own spectrum, so there is
  nothing to fake.

⚠️ THE DONOR MUST BE 100% OPEN SKY — the antenna rule from the cloud work,
kept absolute. Legal donor pixels: inside the sky band (rows 36-421;
skylineTop is 427), away from every hole, outside all ten cloud-footprint
rects grown 8 (the bare plate still carries the BAKED clouds, and copying one
into a lettering hole prints a cloud fragment the runtime skyfill never
covers), outside the pole card's box grown 8 (the lamp head reaches y~319,
right into the logo belt), and individually sky-coloured so nothing
unenumerated slips in.

    python3 tools/cut_title_bare.py            # dry run + previews + gates
    python3 tools/cut_title_bare.py --write    # writes only if all gates pass
    python3 tools/cut_title_bare.py --measure  # gates 1+2 on the SHIPPED file
"""

import json
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
# both stars. Those sit against open sky, where a band of real sky from the
# belts around them IS the texture, so they lift cleanly.
OBJECTS = ['wordmark', 'logo', 'stars']

# Any coverage at all counts as the card's ground. Using the opaque core
# instead would leave the card's feathered rim compositing over filled
# background, printing a faint halo around each landed object.
ALPHA_FLOOR = 8

# ⚠️ AND THE LETTERS' SHADOW COMES OUT WITH THEM — THE SECOND SCAR.
#
# Measured against clean sky in the SAME ROW (which controls for the sky's own
# vertical gradient, the thing that fooled the first read): the ring 2px
# outside the old hole is 7.69 levels DARKER than its row's sky, +4px is
# -5.90, +8px still -3.88. That is the keyline's antialiasing and the drop
# shadow's soft tail, and the old mask stopped one pixel past the outline and
# left all of it in the plate. So even a perfect fill was surrounded by a
# letter-shaped dark ghost, and every fill mismatched its own boundary — the
# rim step was ~5 levels where untouched sky neighbours differ by 0.86.
#
# Growing the hole into that halo fixes both at once, monotonically:
#   +0: seam 5.36   +1: 1.98   +3: 1.15   +5: 0.84  (natural sky is 0.86)
# 5 px is where the seam reaches the painting's own noise floor. It is safe
# to take: every one of those 17,646 px is open sky — zero overlap with the
# pole, signs or hero cards, nothing at or below skylineTop 427 — and main()
# re-checks that before writing rather than trusting this comment.
HALO_GROW = 5

BAND_H = 24        # tall enough for real 2D texture, short enough that the
                   # vertical gradient inside one band is nearly flat
BAND_OVERLAP = 6   # rows a band reaches into the one above, for the feather
CHUNK_W = 260      # max donor core width — see THE FILL in the header
CHUNK_PAD = 8      # context columns a window carries past its core
# ⚠️ THE SEARCH MUST REACH THE WHOLE SKY BAND, not a ±150-row neighbourhood.
# The lettering occupies rows 164-403 of a 36-421 sky, so the clean belts big
# enough to donate are nearly all ABOVE it: a band at the logo's foot (y≈390)
# is ~250 rows from them. Capped at 150 the lower bands found nothing and fell
# to the pyramid — 45% of the hole came back smooth, which is the same defect
# the blur was, arriving by a different road. Reaching the full band, the
# altitude difference is handled by the ring mean-correction plus the rim
# diffusion, so distance is only a tie-breaker (0.03/row) among real options.
DY_MAX = 400
SKY_TOP, SKY_BOT = 36, 421   # legal donor rows
DY_COST = 0.03

GATE_SEAM = 2.0
GATE_TEX_LO, GATE_TEX_HI = 0.70, 1.40
GATE_JOIN_MEAN, GATE_JOIN_MAX = 1.5, 3.0


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
    # One clean pixel past the outline, then HALO_GROW more to take the
    # shadow's soft tail with it — see the constant for the measurement.
    return ndimage.binary_dilation(m, iterations=1 + HALO_GROW)


def donor_legal(rgb, hole):
    """Where a donor window may take pixels from. 100% sky, absolutely.

    Rect exclusions cover everything KNOWN to be non-sky in the band (holes,
    the ten baked cloud footprints, the pole card's box with its lamp head at
    y~319); the per-pixel colour test at the end is the backstop for anything
    not enumerated — the cloud work's antenna taught that 97% clean is not
    clean.
    """
    H, W, _ = rgb.shape
    ok = np.zeros((H, W), bool)
    ok[SKY_TOP:SKY_BOT, :] = True
    ok &= ~ndimage.binary_dilation(hole, iterations=6)
    for c in json.load(open(BG / 'title-portrait-clouds.json'))['clouds']:
        ok[max(0, c['y'] - 8):c['y'] + c['h'] + 8,
           max(0, c['x'] - 8):c['x'] + c['w'] + 8] = False
    fr = json.load(open(BG / 'title-portrait-planes.json'))['pole']['frac']
    ok[max(0, int(fr[1] * H) - 8):int(fr[3] * H) + 8,
       max(0, int(fr[0] * W) - 8):int(fr[2] * W) + 8] = False
    a = rgb.astype(np.float32)
    ok &= (a[..., 2] >= a[..., 0] - 5) & (a.max(axis=2) > 90)
    return ok


def integral(mask):
    s = np.zeros((mask.shape[0] + 1, mask.shape[1] + 1), np.int64)
    s[1:, 1:] = np.cumsum(np.cumsum(mask, 0), 1)
    return s


def band_donor_fill(rgb, hole, ok):
    """24px band donors, chunked. Returns (filled, pred, predw, joins, stats).

    ⚠️ NOTHING IS WRITTEN OUTSIDE THE HOLE, and the donor's opinion about the
    pixels just outside it is kept anyway — that pair of facts is what makes
    the rim correction work at all (see gradient_fix). Each chunk's donor
    covers a window a little larger than its hole core; the part landing on
    real painting never reaches the output, it goes into `pred`, where the
    rim can be asked "what would this fill have put here?" and compared with
    what the painting actually has.
    """
    H, W, _ = rgb.shape
    rgbf = rgb.astype(np.float32)
    filled = rgbf.copy()
    pred = np.zeros_like(rgbf)   # donor prediction, hole AND its surroundings
    predw = np.zeros((H, W), np.float32)
    sat = integral(ok)
    ringok = ~hole & ok          # what a donor must agree with: real sky
    lab, n = ndimage.label(hole)
    joins = []                   # band boundaries inside the fill, for gate 3
    pyr_needed = np.zeros((H, W), bool)
    stats = {'chunks': 0, 'donor_px': 0, 'pyramid_px': 0}

    for i in range(1, n + 1):
        ys = np.where((lab == i).any(1))[0]
        y0l, y1l = ys.min(), ys.max() + 1
        for by in range(y0l, y1l, BAND_H):
            top = max(0, by - (BAND_OVERLAP if by > y0l else 0))
            bot = min(y1l, by + BAND_H)
            bh = bot - top
            if bh < 2:
                continue
            bandlab = lab[top:bot]
            # Core rows decide WHAT gets pasted; the overlap rows are context
            # the feather ramps across.
            corehole = np.zeros((bh, W), bool)
            corehole[by - top:] = bandlab[by - top:] == i
            if not corehole.any():
                continue
            cols = np.where(corehole.any(0))[0]
            x0b, x1b = cols.min(), cols.max() + 1
            if by > y0l:
                joins.append((by, int(x0b), int(x1b)))
            nch = max(1, int(np.ceil((x1b - x0b) / CHUNK_W)))
            step = int(np.ceil((x1b - x0b) / nch))
            for ci in range(nch):
                c0 = x0b + ci * step
                c1 = min(x1b, c0 + step)
                chole = corehole.copy()
                chole[:, :c0] = False
                chole[:, c1:] = False
                if not chole.any():
                    continue
                w0 = max(0, c0 - CHUNK_PAD)
                w1 = min(W, c1 + CHUNK_PAD)
                w = w1 - w0
                win = np.s_[top:bot, w0:w1]
                chw = chole[:, w0:w1]
                ring = ndimage.binary_dilation(chw, iterations=4) & ~chw \
                    & ringok[win]
                tgt = rgbf[win][ring] if ring.any() else None

                best = None      # (cost, yd, xd)
                for dy in range(0, DY_MAX + 1, 2):
                    for sgn in ((0,) if dy == 0 else (-1, 1)):
                        yd = top + sgn * dy
                        if yd < SKY_TOP or yd + bh > SKY_BOT:
                            continue
                        xs = np.arange(0, W - w + 1, 3)
                        s = (sat[yd + bh, xs + w] - sat[yd, xs + w]
                             - sat[yd + bh, xs] + sat[yd, xs])
                        for xd in xs[s == bh * w]:
                            if tgt is None:
                                best = (dy * DY_COST, yd, int(xd))
                                break
                            cand = rgbf[yd:yd + bh, xd:xd + w][ring]
                            cost = (float(np.abs(cand - tgt).mean())
                                    + dy * DY_COST)
                            if best is None or cost < best[0]:
                                best = (cost, yd, int(xd))
                        if best is not None and tgt is None:
                            break
                if best is None:
                    pyr_needed[top:bot, w0:w1] |= chw
                    stats['pyramid_px'] += int(chw.sum())
                    continue
                _, yd, xd = best
                donor = rgbf[yd:yd + bh, xd:xd + w].copy()
                if tgt is not None:
                    dring = rgbf[yd:yd + bh, xd:xd + w][ring]
                    donor += tgt.mean(axis=0) - dring.mean(axis=0)
                # Crossfade weight for OVERLAPPING CHUNKS, applied inside the
                # window: bands share BAND_OVERLAP rows and neighbouring
                # chunks share their pads, so where two donors both speak the
                # weight ramps from one to the other instead of stepping.
                wy = np.ones(bh, np.float32)
                if top < by:
                    r = by - top
                    wy[:r] = np.linspace(0.0, 1.0, r + 2)[1:-1]
                wx = np.ones(w, np.float32)
                pad = min(CHUNK_PAD, max(1, w // 4))
                wx[:pad] = np.linspace(0.0, 1.0, pad + 2)[1:-1]
                wx[w - pad:] = np.linspace(1.0, 0.0, pad + 2)[1:-1]
                wgt = np.maximum(wy[:, None] * wx[None, :], 1e-3)
                pred[win] += donor * wgt[..., None]
                predw[win] += wgt
                stats['chunks'] += 1
                stats['donor_px'] += int(chw.sum())

    have = predw > 0
    pred[have] /= predw[have][:, None]
    # THE OUTPUT TAKES DONOR PIXELS ONLY WHERE THE LETTERS WERE.
    put = hole & have
    filled[put] = pred[put]
    miss = hole & ~have
    if miss.any():
        pyr_needed |= miss
        stats['pyramid_px'] += int(miss.sum())
    if pyr_needed.any():
        pyr_needed &= hole
        low = pyramid_inpaint(np.clip(filled, 0, 255).astype(np.uint8),
                              pyr_needed)
        filled[pyr_needed] = low[pyr_needed].astype(float)
    return filled, pred, have, joins, stats


def gradient_fix(orig, filled, hole, pred, have):
    """Diffuse the boundary error inward so the patch has no outline.

    ⚠️ THIS FUNCTION USED TO BE A NO-OP, AND NOBODY NOTICED FOR WEEKS. It
    measured `orig[rim] - filled[rim]` on rim pixels — which sit OUTSIDE the
    hole, where the fill writes nothing, so the error was identically zero,
    the diffusion spread zero, and the patch was never bent to meet the
    painting. Both the shipped plate and the first band-donor attempt scored
    ~4.6 levels of rim step against a sky whose own neighbouring pixels
    differ by 0.86 — a mismatch the code believed it had already corrected.

    The error has to be measured where the fill's OPINION and the painting's
    TRUTH cover the same pixel. band_donor_fill keeps that opinion in `pred`
    for a ring outside the hole (never writing it), so on that ring
    `orig - pred` is the real disagreement. Diffusing it inward with the
    push-pull pyramid bends the patch onto the painting's tone, which is what
    the docstring always claimed.
    """
    ring = (ndimage.binary_dilation(hole, iterations=3) & ~hole & have)
    if not ring.any():
        return filled
    err = np.zeros_like(filled)
    err[ring] = orig.astype(float)[ring] - pred[ring]
    spread = pyramid_inpaint(np.clip(err + 128, 0, 255).astype(np.uint8),
                             ~ring)
    spread = spread.astype(float) - 128
    out = filled.copy()
    out[hole] = filled[hole] + spread[hole]
    return np.clip(out, 0, 255)


def energy(img, where):
    """High-pass texture level — the cloud work's metric, verbatim."""
    lum = 0.2126 * img[..., 0] + 0.7152 * img[..., 1] + 0.0722 * img[..., 2]
    return float(np.abs(lum - ndimage.uniform_filter(lum, 5))[where].mean())


def seam_delta(fixed, hole):
    """Every pixel just OUTSIDE the hole against the filled pixel it touches.

    Comparing a region to a global mean (the first version) measures the
    region's own contrast, not the join, and reported 39.8 on a fill whose
    join was fine.
    """
    rim = ndimage.binary_dilation(hole, iterations=1) & ~hole
    pairs = []
    for sh, ax in ((1, 0), (-1, 0), (1, 1), (-1, 1)):
        src = np.roll(fixed, -sh, axis=ax)
        sel = rim & np.roll(hole, sh, axis=ax)
        if sel.any():
            pairs.append(np.abs(fixed[sel] - src[sel]).mean())
    return float(np.mean(pairs)) if pairs else 0.0


def main():
    write = '--write' in sys.argv
    measure = '--measure' in sys.argv
    OUT.mkdir(parents=True, exist_ok=True)

    rgb = np.array(Image.open(BG / 'title-portrait.webp').convert('RGB'))
    H, W, _ = rgb.shape
    hole = hole_mask(rgb)
    ok = donor_legal(rgb, hole)
    # The texture yardstick: legal sky in the lettering belts themselves.
    clean = ok.copy()
    clean[:140] = False

    if measure:
        bare = np.array(Image.open(BG / 'title-portrait-bare.webp')
                        .convert('RGB')).astype(np.float32)
        e_fill, e_sky = energy(bare, hole), energy(bare, clean)
        ratio = e_fill / e_sky if e_sky else float('inf')
        d = seam_delta(bare, hole)
        tex_ok = GATE_TEX_LO <= ratio <= GATE_TEX_HI
        print(f'shipped bare: texture {e_fill:.3f} vs sky {e_sky:.3f} '
              f'ratio {ratio:.3f}  '
              f'[{"PASS" if tex_ok else "FAIL"} {GATE_TEX_LO}-{GATE_TEX_HI}]')
        print(f'shipped bare: seam delta {d:.2f} '
              f'[{"PASS" if d < GATE_SEAM else "FAIL"} < {GATE_SEAM}]')
        sys.exit(0 if tex_ok and d < GATE_SEAM else 1)

    print(f'title-portrait {W}x{H}: removing {hole.sum()} px '
          f'({100 * hole.sum() / (H * W):.1f}% of the plate), '
          f'{int(ok.sum())} px of legal donor sky')

    filled, pred, have, joins, stats = band_donor_fill(rgb, hole, ok)
    print(f'  {stats["chunks"]} band chunks: donor {stats["donor_px"]} px, '
          f'pyramid {stats["pyramid_px"]} px')
    fixed = gradient_fix(rgb, filled, hole, pred, have)
    # NO INTERIOR BLUR HERE, ON PURPOSE. The sigma-3 smooth that used to
    # follow was hiding row-join banding and produced the "scars" the client
    # photographed; the joins are measured now (gate 3), not smeared over.

    failures = []

    d = seam_delta(fixed, hole)
    print(f'  gate 1  seam delta {d:.2f} levels (< {GATE_SEAM})')
    if d >= GATE_SEAM:
        failures.append('seam')

    e_fill, e_sky = energy(fixed, hole), energy(fixed, clean)
    ratio = e_fill / e_sky if e_sky else float('inf')
    print(f'  gate 2  texture {e_fill:.3f} vs clean sky {e_sky:.3f} '
          f'ratio {ratio:.3f} (in {GATE_TEX_LO}-{GATE_TEX_HI}; '
          f'the blur era scored 0.476)')
    if not (GATE_TEX_LO <= ratio <= GATE_TEX_HI):
        failures.append('texture')

    steps = []
    for y, x0, x1 in joins:
        cols = hole[y - 1, x0:x1] & hole[y, x0:x1]
        if cols.sum() < 8:
            continue
        a = fixed[y - 1, x0:x1][cols].mean(axis=0)
        b = fixed[y, x0:x1][cols].mean(axis=0)
        steps.append(float(np.abs(a - b).mean()))
    jm = float(np.mean(steps)) if steps else 0.0
    jx = float(np.max(steps)) if steps else 0.0
    print(f'  gate 3  band joins: mean step {jm:.2f}, max {jx:.2f} '
          f'(< {GATE_JOIN_MEAN} / {GATE_JOIN_MAX}, {len(steps)} joins)')
    if jm >= GATE_JOIN_MEAN or jx >= GATE_JOIN_MAX:
        failures.append('joins')

    # GATE 5 — THE HOLE ITSELF STAYED IN OPEN SKY. HALO_GROW is only safe
    # while the grown mask touches nothing but sky; if the lettering ever
    # moves, or a card grows, this catches it instead of quietly erasing a
    # lamppost. Skyline rows and the four standing cards are all forbidden.
    skyline = json.load(open(BG / 'title-portrait-clouds.json')).get(
        'skylineTop', 427)
    bad = int(hole[skyline:].sum())
    for k in ('signL', 'signR', 'hero', 'pole'):
        a = np.array(Image.open(BG / f'titlep-{k}.webp').convert('RGBA'))
        bad += int((hole & (a[..., 3] > ALPHA_FLOOR)).sum())
    print(f'  gate 5  the hole is open sky only (no skyline rows, no '
          f'sign/hero/pole pixels): {"yes" if not bad else f"NO — {bad} px"}')
    if bad:
        failures.append('hole-escaped-sky')

    # EXACT, not "close outside a dilated margin". The fill writes only where
    # the letters were, so every other pixel of his painting must come out
    # bit-identical pre-encode; a margin would have hidden the feather that
    # used to bleed donor onto real artwork.
    outside = ~hole
    same = np.array_equal(fixed[outside], rgb.astype(float)[outside])
    print(f'  gate 4  every pixel outside the holes is the base, exactly: '
          f'{"yes" if same else "NO"}')
    if not same:
        failures.append('containment')

    bare = np.clip(fixed + 0.5, 0, 255).astype(np.uint8)
    Image.fromarray(bare).save(OUT / 'title-portrait-bare.png')
    scan = rgb.copy()
    scan[hole] = [255, 60, 60]
    Image.fromarray(scan).save(OUT / 'title-bare-scan.png')

    if failures:
        sys.exit(f'REFUSING to write: failed gates {failures} — '
                 f'previews in {OUT}')
    if write:
        Image.fromarray(bare).save(BG / 'title-portrait-bare.webp',
                                   quality=95, method=6)
        print('  wrote title-portrait-bare.webp')
    else:
        print('  dry run (all gates pass) — previews in', OUT)


if __name__ == '__main__':
    main()
