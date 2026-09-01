#!/usr/bin/env python3
"""Stop stage clouds showing through the buildings they pass behind.

Client, after the same bug was fixed on the title screen: "go ahead and do the
stages too."

THE BUG, restated for a stage. A day plate's clouds are lifted onto their own
card that DRIFTS (see scrub_stage_clouds.py) and that card is drawn first, so
every other card occludes it — which is what makes a cloud pass behind a
building. Anything the cards do NOT cover is not protected: the cloud simply
draws over the base's own painted structure there, so it crosses the building
in front, or worse, threads in and out of it wherever coverage is patchy.

Measured with the corrected sky test (see below), before this ran:

    eav-day          3,881 px of structure in the cloud band uncovered
    edgewood-day    12,393
    l5p-day          8,736
    underground-day 68,244

⚠️ THE SKY TEST HAS A BRIGHTNESS FLOOR, and that is the whole reason those
numbers went UP rather than down when it was corrected. Sky is found by
flooding blue from the top of the plate; a building's shadowed face is painted
dark blue and meets the sky at its roofline, so a flood that only asks "is it
blue" runs the full height of the shadow and calls the strip sky. On the title
plate the two populations measured cleanly apart — shadow under 0.40, real sky
0.596 to 0.694 — so the floor sits at 0.50 in the empty gap.

WHAT THIS WRITES. `<stage>-skystruct.webp`: the sky band's static furniture —
towers, poles, signage, wires — carrying the base plate's own pixels, declared
at BASE_DEPTH so it moves at exactly the base's rate and therefore registers
with its copy underneath to the pixel, forever. Drawn after the clouds, it is
what the weather passes behind.

⚠️ IT SEALS THE WHOLE BAND AND TRUSTS NO OTHER CARD. The first version took
credit for coverage from every other card in the stage — if the `towers` card
was opaque somewhere, that somewhere was treated as already protected — and
dilated those footprints by 5px on top, on the theory that baking a swaying
tree crown into a static overlay would double it.

Both halves of that were wrong, and the in-game measurement caught it:
Underground still leaked 1,259 px of cloud onto the tall building's top-left
corner, worst blob 734 px, plainly visible in the frame.

  * A CARD DOES NOT SIT WHERE ITS FOOTPRINT SAYS. Cards parallax away from the
    base by up to MAX_SEPARATION (16px, backdrop.js) — that is the whole point
    of the multiplane. So along every card's edge there is a strip up to 16px
    wide that the footprint claims and the card does not actually cover, and a
    cloud drawn underneath shows straight through it.
  * SEALING IS VISUALLY FREE, so there was nothing to be cautious about. The
    card carries the BASE's own pixels at the BASE's own rate; drawing it is
    drawing what is already there, at the same coordinate, a second time. It
    cannot double against a swaying crown, because the base's copy of that
    crown is what it is drawing. The only thing it changes is that a cloud can
    no longer be seen through the building.

The one real cost is the plate's top FEATHER — drawPlate dissolves the top
edge of the painting into the sky, and a sealed pixel inside that gradient is
restored to full strength. That is measured in the game rather than argued
about: a `bare` capture (no clouds, no seal) diffed against the shipped frame
says exactly what the seal costs cosmetically.

    python3 tools/seal_stage_clouds.py            # report only
    python3 tools/seal_stage_clouds.py --write
"""

import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
BG = ROOT / 'src' / 'assets' / 'backgrounds'
STAGES = ['eav-day', 'edgewood-day', 'l5p-day', 'underground-day', 'buckhead-day']
SKY_MIN_V = 0.50      # see the note above


def seal(stem, write):
    base = np.array(Image.open(BG / f'{stem}-base.webp').convert('RGB'))
    H, W, _ = base.shape
    cpath = BG / f'{stem}-clouds.webp'
    if not cpath.exists():
        print(f'{stem}: no clouds card, skipped')
        return
    ca = np.array(Image.open(cpath).convert('RGBA'))[..., 3]
    ys, _xs = np.where(ca > 8)
    if not len(ys):
        print(f'{stem}: clouds card is empty, skipped')
        return
    top, bot = ys.min(), ys.max()

    ssname = f'{stem}-skystruct.webp'
    have = (BG / ssname).exists()
    existing = (np.array(Image.open(BG / ssname).convert('RGBA'))
                if have else np.zeros((H, W, 4), np.uint8))

    r, g, b = (base[..., 0].astype(int), base[..., 1].astype(int),
               base[..., 2].astype(int))
    mx = base.max(axis=2) / 255.0
    mn = base.min(axis=2) / 255.0
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    blue = (b > r + 12) & (b > g + 4) & (mx > SKY_MIN_V)
    cloudish = (mx > 0.62) & (sat < 0.30)
    core = ndimage.binary_erosion(blue & ~cloudish, iterations=1)
    lab, _ = ndimage.label(core)
    sky = np.isin(lab, np.unique(lab[0:4][lab[0:4] > 0]))
    sky = ndimage.binary_dilation(sky, iterations=1) & blue

    # ⚠️ STRUCTURE IS WHAT THE PAINTING HANGS FROM, NOT JUST "NOT SKY".
    #
    # Two failures, in opposite directions, and the rule below is what sits
    # between them.
    #
    #   * Asking `not sky and not cloudish` misses buildings. "Bright and
    #     unsaturated" is a cloud and it is also the pale stone pier between
    #     two windows; on the Underground plate it claimed 41,406 px of the
    #     band, mostly the tan facade of the tall building top-left, in strips
    #     between the window bays. Unsealed, the drifting clouds came through
    #     them — 326 px measured in the running game, a 115 px blob, exactly
    #     where the client's screenshots point.
    #   * Asking `not sky` alone swallows the WEATHER. These plates still have
    #     clouds painted into them that the scrub left behind, and sealing
    #     those makes them static furniture for the drifting card to hide
    #     behind. On EAV that took the clouds off the stage almost entirely:
    #     9 px of moving cloud left on screen at tick 400, against a client
    #     who asked for "moving clouds everywhere".
    #
    # What separates them is what each one is SURROUNDED BY, taken a blob at a
    # time. Two signals, and on all four plates both land in a wide gap:
    #
    #   SKY RING — how much of the 3px ring around the blob is open sky. A
    #   cloud floats in it (0.50-0.76 measured); a stone pier is ringed by its
    #   own windows and cornices (0.00-0.11).
    #
    #   DARK RING — how much of that ring is black keyline. These plates are
    #   drawn comic-style: every object carries an ink outline and weather
    #   does not. Clouds measured 0.00-0.10, structure 0.14-0.93.
    #
    # Attachment was tried first and is not good enough on its own: L5P's
    # CRIMINAL sign board is pale enough to merge into one blob with the cloud
    # beside it, and Underground's real cloud reaches the bottom row of the
    # band, so "does it hang off the bottom" calls one of each wrong. The two
    # ring tests get all of those right, and where they disagree the blob is
    # SEALED — a cloud sealed by mistake merely stops drifting, a building
    # freed by mistake is the bug this file exists to fix.
    band = np.zeros((H, W), bool)
    band[top:bot + 1] = True
    dark = mx < 0.35
    lab2, n2 = ndimage.label(band & cloudish, structure=np.ones((3, 3)))
    weather = np.zeros((H, W), bool)
    kept = 0
    for k in range(1, n2 + 1):
        blob = lab2 == k
        ring = ndimage.binary_dilation(blob, iterations=3) & ~blob
        rs = max(1, int(ring.sum()))
        if (ring & sky).sum() / rs >= 0.40 and (ring & dark).sum() / rs <= 0.12:
            weather |= blob
            kept += 1
    structure = band & ~sky & ~weather
    print(f'{stem:16s} {n2} pale masses in the band, {kept} left as weather '
          f'({int(weather.sum())} px still drifts over)')
    leak = structure & (existing[..., 3] <= 128)
    # Specks are dither, not buildings; wires are long, so size not shape.
    lb, n = ndimage.label(leak, structure=np.ones((3, 3)))
    if n:
        sizes = ndimage.sum(leak, lb, range(1, n + 1))
        leak = np.isin(lb, np.arange(1, n + 1)[sizes >= 12])

    print(f'{stem:16s} band rows {top}-{bot}   leaking {int(leak.sum()):6d} px'
          f'   (skystruct {"exists" if have else "NEW"})')

    out = existing.copy()
    out[leak, 0:3] = base[leak]
    out[leak, 3] = 255
    still = int((structure & (out[..., 3] <= 128)).sum())
    print(f'                 after: {still} px uncovered')

    xs2 = np.where((out[..., 3] > 8).any(axis=0))[0]
    span = (round(xs2.min() / W, 3), round(min(1.0, (xs2.max() + 1) / W), 3)) if len(xs2) else (0, 0)
    print(f'                 span for stages.js: [{span[0]:.3f}, {span[1]:.3f}]')

    if write:
        Image.fromarray(out).save(BG / ssname, quality=95, method=6, lossless=True)
        print(f'                 wrote {ssname}')


def main():
    write = '--write' in sys.argv
    for stem in STAGES:
        seal(stem, write)
    if not write:
        print('\nreport only — pass --write to seal')


if __name__ == '__main__':
    main()
