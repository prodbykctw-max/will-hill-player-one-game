#!/usr/bin/env python3
"""
Turn a photograph into pixel art that matches THIS GAME's plates.

Not generic pixelation. The four stage backdrops are a specific look — chunky
pixels, a limited but warm palette, cool shadow against warm practicals, high
local contrast — and the way to land in it is to stop inventing a palette and
take the game's own.

HOW IT WORKS

  1. LEARN THE PALETTE from the shipped plates. k-means over pixels sampled
     from src/assets/backgrounds/*.webp gives the colours this game is
     actually made of, weighted the way it actually uses them. Passing
     --palette day uses the daytime plates instead, which matters: a night
     palette has no sky blue in it and will turn a daylit photo teal.

  2. DOWNSCALE BY AREA AVERAGE, not by sampling. Nearest-neighbour
     downscaling of a photograph throws away nine tenths of the pixels and
     keeps whichever one happened to land on the grid, which is why naive
     pixelation looks noisy. Averaging is what makes a 900px crowd read as a
     300px crowd instead of a sparkle.

  3. PUNCH IT before quantising. Photographs are low-contrast next to pixel
     art; the plates have deep shadow and bright practicals and very little
     in between. A contrast and saturation lift before the palette map is
     what stops the result reading as a blurry photo with big pixels.

  4. QUANTISE TO THE IMAGE'S OWN COLOURS, THEN PULL THEM TOWARD THE GAME'S.
     Snapping straight onto the game palette was the first attempt and it
     fails on anything the plates do not contain: the night plates are almost
     entirely streetlight orange and deep brown with no skin tones in them at
     all, so a photograph of a crowd came back with every face bright red.
     So the image is quantised to its OWN k colours — which keeps the subject
     recognisable — and each of those is then dragged a fraction of the way
     toward its nearest neighbour in the game palette. --blend 0 leaves the
     photo's colour alone, 1 is the old snap-to-palette behaviour, and the
     default sits where the mood transfers but faces stay faces.
     No dithering either way: dithering fakes colours you do not have, and
     pixel art wants flat areas of the ones you do.

  5. FLATTEN BEFORE QUANTISING. The step that was missing, and the one that
     decides whether this reads as game art or as a photo with big pixels.
     Photographs are texture everywhere — skin grain, fabric weave, sensor
     noise — and quantising texture just gives you noisy pixels. A median
     filter at the small size collapses that texture into REGIONS of one
     colour, which is what hand-drawn and AI pixel art is actually made of:
     flat shapes with hard edges. Median rather than blur, because a blur
     softens the edges too and the edges are the whole point.

  6. OUTLINE. The one thing that makes pixel art read as pixel art rather
     than as a small photo: a darker line where luminance falls off a cliff.
     Applied at the small size so the line is exactly one pixel.

Usage:
    python3 tools/pixelate.py assets/refs/vinyl-crowd.webp out.png --width 320
    python3 tools/pixelate.py in.png out.png --width 280 --colors 40 --palette day
"""
import argparse
import glob
import os

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BG = os.path.join(ROOT, 'src', 'assets', 'backgrounds')

# Whole composed plates, not the cut cards — a card is mostly transparent and
# would weight the palette toward whatever few pixels it kept.
NIGHT = ['eav.webp', 'edgewood.webp', 'l5p.webp', 'underground.webp']
DAY = ['eav-day.webp', 'edgewood-day.webp', 'l5p-day.webp', 'underground-day.webp']

# Human eyes weight green most and blue least. Nearest-colour in raw RGB
# ignores that and will happily swap a brown for a navy of the same distance.
CHAN_W = np.array([0.30, 0.59, 0.11])


def learn_palette_from(data, k, seed=7):
    rng = np.random.default_rng(seed)
    if len(data) > 40000:
        data = data[rng.choice(len(data), 40000, replace=False)]
    centres = [data[rng.integers(len(data))]]
    for _ in range(k - 1):
        d = np.min(((data[:, None, :] - np.array(centres)[None]) ** 2 * CHAN_W).sum(2), axis=1)
        tot = d.sum()
        centres.append(data[rng.choice(len(data), p=d / tot) if tot > 0
                            else rng.integers(len(data))])
    C = np.array(centres)
    for _ in range(14):
        lab = np.argmin((((data[:, None, :] - C[None]) ** 2) * CHAN_W).sum(2), axis=1)
        for i in range(k):
            m = lab == i
            if m.any():
                C[i] = data[m].mean(0)
    return np.clip(C, 0, 255)


def learn_palette(names, k, seed=7):
    px = []
    for n in names:
        p = os.path.join(BG, n)
        if not os.path.exists(p):
            continue
        im = Image.open(p).convert('RGB')
        im.thumbnail((300, 300), Image.LANCZOS)
        px.append(np.asarray(im).reshape(-1, 3).astype(np.float64))
    if not px:
        raise SystemExit(f'no plates found in {BG}')
    # k-means++ style seeding, in learn_palette_from: a plain random pick
    # lands most centres in the huge dark region these night plates are made
    # of and the palette comes back with nine blacks.
    return learn_palette_from(np.vstack(px), k, seed)


def blend_toward(own, game, amount):
    """Pull each of the image's own colours toward the nearest game colour."""
    if amount <= 0:
        return own
    d = (((own[:, None, :] - game[None]) ** 2) * CHAN_W).sum(2)
    near = game[np.argmin(d, axis=1)]
    return np.clip(own * (1 - amount) + near * amount, 0, 255)


def quantise(arr, palette):
    h, w, _ = arr.shape
    flat = arr.reshape(-1, 3).astype(np.float64)
    out = np.empty_like(flat)
    # In chunks: a 320x240 image against 48 colours is 3.7M distance terms,
    # which is fine, but a full-size plate is not.
    for i in range(0, len(flat), 20000):
        c = flat[i:i + 20000]
        d = (((c[:, None, :] - palette[None]) ** 2) * CHAN_W).sum(2)
        out[i:i + 20000] = palette[np.argmin(d, axis=1)]
    return out.reshape(h, w, 3).astype(np.uint8)


def outline(arr, strength=0.42, thresh=34):
    """Darken a pixel that sits on a luminance cliff. This is the single step
    that separates 'pixel art' from 'photo with big pixels'."""
    lum = (arr.astype(np.float64) * CHAN_W).sum(2)
    dy = np.zeros_like(lum); dx = np.zeros_like(lum)
    dy[1:, :] = lum[1:, :] - lum[:-1, :]
    dx[:, 1:] = lum[:, 1:] - lum[:, :-1]
    edge = (np.abs(dy) > thresh) | (np.abs(dx) > thresh)
    # Only darken the DARKER side of the cliff, so the line reads as the
    # object's own contour rather than a halo drawn around it.
    darker = np.zeros_like(edge)
    darker[1:, :] |= edge[1:, :] & (lum[1:, :] < lum[:-1, :])
    darker[:, 1:] |= edge[:, 1:] & (lum[:, 1:] < lum[:, :-1])
    out = arr.astype(np.float64)
    out[darker] *= (1.0 - strength)
    return np.clip(out, 0, 255).astype(np.uint8)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('out')
    ap.add_argument('--width', type=int, default=320, help='pixel-art width')
    ap.add_argument('--colors', type=int, default=48)
    ap.add_argument('--palette', choices=['night', 'day'], default='night')
    ap.add_argument('--contrast', type=float, default=1.28)
    ap.add_argument('--saturation', type=float, default=1.22)
    ap.add_argument('--blend', type=float, default=0.45,
                    help="0 = keep the photo's colour, 1 = snap to the game palette")
    ap.add_argument('--smooth', type=int, default=3,
                    help='median radius that flattens photo texture into regions (0 = off)')
    ap.add_argument('--outline-strength', type=float, default=0.42)
    ap.add_argument('--outline-thresh', type=int, default=34)
    ap.add_argument('--no-outline', action='store_true')
    ap.add_argument('--scale', type=int, default=0,
                    help='nearest-neighbour upscale for viewing (0 = none)')
    a = ap.parse_args()

    im = Image.open(a.src).convert('RGB')
    W = a.width
    H = max(1, round(im.height * W / im.width))

    # Area average, then punch, then quantise. Order matters: punching after
    # the palette map just shifts colours off the palette again.
    small = im.resize((W, H), Image.BOX)
    small = ImageEnhance.Color(ImageEnhance.Contrast(small).enhance(a.contrast)).enhance(a.saturation)
    if a.smooth:
        # Twice at a small radius beats once at a large one: it flattens the
        # interiors without eating small features like eyes and hands.
        for _ in range(2):
            small = small.filter(ImageFilter.MedianFilter(a.smooth))

    # The image's own palette first, so the subject survives.
    own = learn_palette_from(np.asarray(small).reshape(-1, 3).astype(np.float64),
                             a.colors)
    names = NIGHT if a.palette == 'night' else DAY
    game = learn_palette(names, max(16, a.colors // 2))
    pal = blend_toward(own, game, a.blend)
    arr = quantise(np.asarray(small), pal)
    if not a.no_outline:
        arr = outline(arr, a.outline_strength, a.outline_thresh)

    res = Image.fromarray(arr)
    if a.scale > 1:
        res = res.resize((W * a.scale, H * a.scale), Image.NEAREST)
    res.save(a.out)
    print(f'{a.src} {im.size} -> {W}x{H} @ {a.colors} colours '
          f'from the {a.palette} plates -> {a.out}')


if __name__ == '__main__':
    main()
