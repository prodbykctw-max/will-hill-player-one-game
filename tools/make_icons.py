#!/usr/bin/env python3
"""
Generate the PWA / favicon set from Will Hill's own sprite sheet.

THE ICON IS THE HUD PORTRAIT. The client asked for the app icon to be "the
image top left of the game", and that image is not a file — it is a crop the
HUD takes out of the spritesheet at runtime (drawPortrait in
src/render/hud.js). So this script performs the SAME crop, from the same
atlas, rather than exporting a separate piece of art that would drift the
first time the sprite is regenerated.

The crop is kept deliberately in lockstep with hud.js:

    charTop = (fit.b - fit.h) * cellH        top of the occupied band
    headH   = fit.h * cellH * 0.34           head is ~34% of the figure
    fx, fy  = idle clip's first frame, located from its LINEAR start index

If drawPortrait's numbers ever change, change them here too — or the app icon
and the in-game portrait stop being the same picture, which is the one thing
this is for.

Output: src/assets/icon-<size>.png plus a maskable variant with the safe-zone
padding Android needs, and an .ico for desktop browsers.

Usage:
    python tools/make_icons.py
"""
import json
import os
from PIL import Image, ImageFilter

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPRITES = os.path.join(REPO_ROOT, 'src', 'assets', 'sprites')
# public/, NOT src/assets/. Vite content-hashes anything imported from src/,
# and a manifest has to point at a STABLE path — the OS caches an installed
# app's icon by URL, so a hash that changes on every rebuild means the
# installed icon quietly 404s after a deploy. Files in public/ are copied
# through verbatim.
OUT_DIR = os.path.join(REPO_ROOT, 'public', 'icons')

SIZES = [192, 512]
# The HUD portrait box is a dark panel with a warm border; the icon repeats it
# so the installed app and the in-game portrait are visibly the same object.
PANEL = (12, 10, 20, 255)
BORDER = (255, 214, 110, 255)


def head_crop():
    """The exact region hud.js draws into the portrait box."""
    atlas = json.load(open(os.path.join(SPRITES, 'will-hill.atlas.json')))
    sheet = Image.open(os.path.join(SPRITES, 'will-hill.webp')).convert('RGBA')

    cell_w, cell_h = atlas['frameSize']
    idle = atlas['animations']['idle']
    fit = atlas.get('fitRef', {'h': 1, 'b': 1})

    char_top = (fit['b'] - fit['h']) * cell_h
    head_h = fit['h'] * cell_h * 0.34
    head_w = head_h

    idx = idle['start'] if 'start' in idle else idle['row'] * atlas['cols']
    fx = (idx % atlas['cols']) * cell_w
    fy = (idx // atlas['cols']) * cell_h

    left = fx + cell_w / 2 - head_w / 2
    return sheet.crop((round(left), round(fy + char_top),
                       round(left + head_w), round(fy + char_top + head_h)))


def compose(head, size, maskable=False):
    """Portrait box at `size`. Maskable icons keep the head inside Android's
    safe zone — the launcher is free to crop to a circle, and a head that
    fills the square loses its ears and the brim of the cap to that mask."""
    img = Image.new('RGBA', (size, size), PANEL)

    inset = round(size * 0.20) if maskable else round(size * 0.055)
    box = size - inset * 2
    # NEAREST, not LANCZOS. The source head is only 81x80 real pixels, and a
    # smooth resample to 512 turns a pixel-art face into a watercolour of one
    # — every hard edge in the cap and the shades goes soft. Nearest keeps the
    # art crisp and, at these ratios, keeps the pixels close to square.
    h = head.resize((box, box), Image.NEAREST)

    # Warm rim light behind the head, so the silhouette separates from the
    # panel at 48px where the sprite's own shading is a couple of pixels.
    glow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    glow.paste(h, (inset, inset), h)
    glow = glow.filter(ImageFilter.GaussianBlur(size * 0.045))
    tint = Image.new('RGBA', (size, size), (255, 190, 90, 0))
    tint.putalpha(glow.getchannel('A').point(lambda a: min(150, int(a * 0.75))))
    img.alpha_composite(tint)

    img.paste(h, (inset, inset), h)

    if not maskable:
        b = max(2, round(size * 0.035))
        edge = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        for i in range(b):
            for xy in ((i, i, size - 1 - i, i), (i, size - 1 - i, size - 1 - i, size - 1 - i),
                       (i, i, i, size - 1 - i), (size - 1 - i, i, size - 1 - i, size - 1 - i)):
                x0, y0, x1, y1 = xy
                for x in range(x0, x1 + 1):
                    for y in range(y0, y1 + 1):
                        edge.putpixel((x, y), BORDER)
        img.alpha_composite(edge)
    return img


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    head = head_crop()
    print(f"head crop from will-hill.webp: {head.size}")

    made = []
    for s in SIZES:
        p = os.path.join(OUT_DIR, f'icon-{s}.png')
        compose(head, s).save(p)
        made.append(p)
        pm = os.path.join(OUT_DIR, f'icon-maskable-{s}.png')
        compose(head, s, maskable=True).save(pm)
        made.append(pm)

    # Favicon: the same picture, multi-resolution so a browser tab, a bookmark
    # bar and a desktop shortcut each pick a size drawn for them rather than
    # downsampling a 512 and turning the face to mush.
    ico = os.path.join(OUT_DIR, 'favicon.ico')
    compose(head, 256).save(ico, sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    made.append(ico)

    apple = os.path.join(OUT_DIR, 'apple-touch-icon.png')
    compose(head, 180).save(apple)
    made.append(apple)

    for p in made:
        print(f"  {os.path.relpath(p, REPO_ROOT)}  {os.path.getsize(p)} bytes")


if __name__ == '__main__':
    main()
