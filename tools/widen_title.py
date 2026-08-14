#!/usr/bin/env python3
"""Widen the portrait title plate so it fills a phone edge to edge.

THE PROBLEM, MEASURED. The painting is 853x1844 — 0.4626 wide-over-tall. The
title is drawn contain-fit, so any screen wider than that gets black pillarbox
bars. His phone is about 0.571 and shows 45px of black each side. No crop can
fix it: closing the bars by cropping costs 350 rows off the top, and rows
0-350 hold the sky, the clouds, WILL HILL: and most of PLAYER ONE.

So the plate has to get wider. Client, repeatedly: "if you just widen the
actual image I don't have to worry about that... I want the image stretched
wide so it fills those black spaces."

WHY THIS IS DONE LOCALLY AND NOT BY AN AI OUTPAINT. Outpainting means uploading
his painting to a third-party service. This project has already declined making
the repo public because it holds his voice recording, his sprite sheets and
Will Hill's plates; shipping the title art off the machine is the same
decision and it is not mine to make. Mirror-extension needs no such thing.

HOW IT EXTENDS, AND WHY A PLAIN MIRROR DOES NOT WORK. First attempt was a
squashed mirror. Looked at it: the plate is horizontal bands of very different
content, and a mirror is invisible on sky, foliage and wet road and a disaster
on anything with a letter or a landmark in it. It put **WILL** and **ƎNO
ЯƎYAJP** backwards down both edges, a second red star beside each real one, a
second lamp post and a second ATL banner on the right, and mirrored highway
signs with the text reversed. Unusable, and no amount of squash fixes it,
because the problem is that the content is legible at all.

So the structure is DISSOLVED on the way out instead of repeated. Each margin
starts as a mirror at the seam — which is what makes the colour and the
horizon lines continue correctly — and is then progressively defocused across
its width, from sharp at the seam to a heavy blur at the frame edge. Letters,
signs and lamp posts smear into their own colours within about forty pixels
while the sky stays sky, the tree line stays a green band and the wet street
stays a dark reflective band. A darkening ramp on top of it (EDGE_SHADE) sends
the outer edge into shadow, which is what depth of field and vignetting both
do anyway, and an eye does not go looking in a corner that is falling dark.

The result reads as the scene continuing out of focus past the frame, rather
than as the scene happening twice.

NOTHING OF HIS PAINTING IS TOUCHED. The original 853 columns are pasted back
in at full strength after the extension, and the script refuses to write if
they are not bit-for-bit identical.
"""
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
BG = os.path.join(HERE, '..', 'src', 'assets', 'backgrounds')

SRC = 'title-portrait.webp'
OUT = 'title-portrait-wide.webp'

# 1180x1844 is 0.640 wide-over-tall. Measured against real phone viewports:
# the widest case in the sweep was his own screenshot at ~0.571 and an iPhone
# SE at 0.562, so this clears every phone with room, including the extra width
# a browser's URL bar creates by shortening the viewport. Tablets still bar and
# that is fine — nothing is being demoed on an iPad.
NEW_W = 1180
EDGE_SHADE = 0.40    # how dark the outermost column goes, 1.0 = untouched
SHADE_START = 0.12   # fraction of the margin held at full brightness
# Defocus ramp. SHARP_FOR of the margin nearest the seam stays crisp so the
# horizon lines meet; past that the blur climbs to MAX_SIGMA at the frame edge.
# 26 is enough to take a 30px-tall letterform apart completely — measured
# against the wordmark, which is the most legible thing near an edge.
SHARP_FOR = 0.06
MAX_SIGMA = 26.0
BLUR_LEVELS = 7


# The title band, and the three things in it that must never be mirrored.
# Blur alone does not save them: the right-hand star sits only 53px in from the
# edge, so at the defocus that far out it survives as a recognisable red blob,
# and the gold of PLAYER ONE runs all the way to column 851 and smears into a
# warm streak. Both were plainly visible in the second proof. They are painted
# out of the SOURCE with the row's own sky before anything is mirrored, so the
# top band extends as sky and cloud and nothing else.
TITLE_BAND = (140, 440)


def clean_source(rgb):
    """Sky-fill the stars and the wordmark so they cannot be mirrored out."""
    out = rgb.astype(np.float32).copy()
    R, G, B = out[..., 0], out[..., 1], out[..., 2]
    mx = out.max(2)
    mn = out.min(2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)

    star = (R > 90) & (R > G * 1.7) & (R > B * 1.4)          # red stars
    gold = (R > 120) & (R > B + 55) & (G > B + 25) & (sat > 0.35)
    white = (mx > 150) & (sat < 0.22)
    ink = (out.mean(2) < 70)                                  # the black outline
    kill = star | gold | white | ink
    band = np.zeros(kill.shape, bool)
    band[TITLE_BAND[0]:TITLE_BAND[1], :] = True
    kill &= band

    # Sky is what is left in the band: blue, and not any of the above.
    sky = band & ~kill & (B > R + 24)
    for y in range(TITLE_BAND[0], TITLE_BAND[1]):
        if not kill[y].any():
            continue
        src = out[y][sky[y]]
        if len(src) < 8:
            src = out[y][band[y] & (B[y] > R[y] + 24)]
        if len(src) < 8:
            continue
        out[y][kill[y]] = np.median(src, axis=0)
    return out.astype(np.uint8)


def extend_side(rgb, margin, left):
    """Mirror the plate outward, dissolving structure as it goes."""
    import scipy.ndimage as ndi
    h, w = rgb.shape[:2]
    src = clean_source(rgb)
    take = min(w, margin)
    slab = src[:, :take] if left else src[:, w - take:]
    band = slab[:, ::-1].astype(np.float32)        # mirror: colours continue
    if band.shape[1] < margin:                     # pad if the plate is narrow
        pad = margin - band.shape[1]
        edge = band[:, :1] if left else band[:, -1:]
        band = np.concatenate([np.repeat(edge, pad, 1), band] if left
                              else [band, np.repeat(edge, pad, 1)], axis=1)
    band = band[:, -margin:] if left else band[:, :margin]

    # Distance from the seam, 0 at the seam and 1 at the frame edge.
    d = np.linspace(1.0, 0.0, margin) if left else np.linspace(0.0, 1.0, margin)
    focus = np.clip((d - SHARP_FOR) / (1.0 - SHARP_FOR), 0, 1)

    # A stack of progressively blurred copies, picked per column by `focus`.
    # Blurring the whole band once per level and selecting is far cheaper than
    # a per-column variable kernel and looks the same.
    sigmas = np.linspace(0, MAX_SIGMA, BLUR_LEVELS)
    stack = [band] + [ndi.gaussian_filter(band, (s, s, 0), mode='nearest')
                      for s in sigmas[1:]]
    pos = focus * (BLUR_LEVELS - 1)
    lo = np.floor(pos).astype(int)
    hi = np.minimum(lo + 1, BLUR_LEVELS - 1)
    t = (pos - lo)[None, :, None]
    out = np.empty_like(band)
    for k in range(BLUR_LEVELS):
        m = lo == k
        if not m.any():
            continue
        out[:, m] = stack[k][:, m] * (1 - t[:, m]) + stack[hi[m][0]][:, m] * t[:, m] \
            if (hi[m] == hi[m][0]).all() else stack[k][:, m]
    # Blend level-to-level properly wherever the shortcut above did not apply.
    for k in range(BLUR_LEVELS - 1):
        m = lo == k
        if m.any():
            out[:, m] = stack[k][:, m] * (1 - t[:, m]) + stack[k + 1][:, m] * t[:, m]

    ramp = np.clip((d - SHADE_START) / (1.0 - SHADE_START), 0, 1)
    shade = 1.0 - ramp * (1.0 - EDGE_SHADE)
    return np.clip(out * shade[None, :, None], 0, 255).astype(np.uint8)


def widen(rgb, new_w):
    h, w = rgb.shape[:2]
    if new_w <= w:
        raise SystemExit(f'{new_w} is not wider than {w}')
    total = new_w - w
    left_m = total // 2
    right_m = total - left_m
    out = np.zeros((h, new_w, 3), np.uint8)
    out[:, :left_m] = extend_side(rgb, left_m, True)
    out[:, left_m:left_m + w] = rgb          # HIS PAINTING, untouched
    out[:, left_m + w:] = extend_side(rgb, right_m, False)
    return out, left_m, right_m


def main():
    src = os.path.join(BG, SRC)
    rgb = np.asarray(Image.open(src).convert('RGB'))
    h, w = rgb.shape[:2]
    new_w = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else NEW_W

    out, lm, rm = widen(rgb, new_w)
    print(f'{SRC}  {w}x{h}  ({w / h:.4f})')
    print(f'  -> {new_w}x{h}  ({new_w / h:.4f})   +{lm} left, +{rm} right')

    # Prove his columns survived byte for byte.
    same = np.array_equal(out[:, lm:lm + w], rgb)
    print(f'  original {w} columns identical: {same}')
    if not same:
        raise SystemExit('the centre was modified — refusing to write')

    dst = os.path.join(BG, OUT)
    if '--proof' in sys.argv:
        p = '/tmp/title_wide_proof.png'
        Image.fromarray(out).save(p)
        print(f'  proof -> {p}  (nothing written to the repo)')
        return
    Image.fromarray(out).save(dst, quality=94, method=6)
    print(f'  -> {OUT}')


if __name__ == '__main__':
    main()
