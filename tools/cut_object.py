#!/usr/bin/env python3
"""
Cut a single object out of a stage background along its REAL outline, so it
can be given its own parallax rate.

The point is perspective. A billboard set far back should drift past slowly —
you spend a long time travelling from one end of it to the other — while the
fence a few metres away whips by. Same reason the moon appears to hang while
roadside trees tear past. Giving the far object a SLOWER rate than the plate
is what sells its distance.

The outline is a polygon traced from the art, not a bounding box. A box cut
was tried and rejected: the straight edges read as visible seams because they
don't follow anything actually in the picture. Here the Swifty billboard's
bottom edge follows the Citgo canopy roofline that occludes it.

Two products:
  <stage>-<name>.webp   the cutout, alpha outside the traced outline
  <stage>-base.webp     the plate with that object erased

The erase matters: leave the original pixels in the plate and, once the
cutout moves at a different rate, you see the object twice. The hole is
refilled by stretching the sky strip directly above it downward, so the fill
inherits the sky's own gradient.

Usage:
    python tools/cut_object.py
"""
import os
from PIL import Image, ImageDraw, ImageFilter

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(REPO_ROOT, 'assets', 'backgrounds')
OUT = os.path.join(REPO_ROOT, 'src', 'assets', 'backgrounds')

FEATHER = 1.0  # px of alpha falloff; enough to kill the stair-stepping

OBJECTS = {
    'eav': [
        {
            'name': 'swifty',
            # Traced off the art: top edge runs nearly level with a slight
            # rise to the right; the bottom follows the Citgo canopy roofline
            # sweeping up from lower-left to upper-right, which is what
            # actually occludes the board.
            'poly': [
                (206, 18), (676, 15), (676, 90), (560, 90),
                (470, 102), (380, 118), (300, 121), (206, 121),
            ],
            # sky strip immediately above the board, stretched down to fill
            'sky_band': (0, 16),
            'key_sky': True, 'sky_tol': 44,
        },
        {
            'name': 'citgo',
            # The forecourt canopy and CITGO fascia. Top edge traced along the
            # roofline as it sweeps up from lower-left to the right; bottom
            # edge stops where the fence boards begin, since the fence belongs
            # to the nearest layer and must not be dragged along with this one.
            'poly': [
                (118, 212), (200, 196), (300, 164), (400, 131), (500, 99),
                (600, 71), (700, 64), (884, 56),
                (884, 168), (700, 172), (600, 176), (500, 181),
                (400, 189), (300, 201), (200, 216), (118, 240),
            ],
            'sky_band': (2, 20),
        },
    ],
}


def main():
    os.makedirs(OUT, exist_ok=True)
    for stage, objs in OBJECTS.items():
        ref = os.path.join(SRC, stage, 'reference.png')
        if not os.path.exists(ref):
            print(f'skip {stage}: no reference')
            continue
        im = Image.open(ref).convert('RGB')
        base = im.copy()
        w, h = im.size

        for o in objs:
            mask = Image.new('L', (w, h), 0)
            ImageDraw.Draw(mask).polygon(o['poly'], fill=255)

            # The polygon is a hand-traced approximation, so its edge doesn't
            # sit exactly on the object's. Refine it by KEYING OUT the sky:
            # inside the polygon, drop any pixel close to the sky colour. The
            # result follows the object's true silhouette pixel by pixel
            # instead of a straight line drawn near it.
            if o.get('key_sky'):
                sy0, sy1 = o['sky_band']
                sky = im.crop((o['poly'][0][0], sy0, o['poly'][1][0], sy1))
                sp = list(sky.getdata())
                n = len(sp)
                sky_rgb = tuple(sum(c[i] for c in sp) // n for i in range(3))
                tol = o.get('sky_tol', 46)
                px = im.load()
                mp = mask.load()
                for yy in range(h):
                    for xx in range(w):
                        if not mp[xx, yy]:
                            continue
                        r, g, b = px[xx, yy]
                        if (abs(r - sky_rgb[0]) + abs(g - sky_rgb[1]) + abs(b - sky_rgb[2])) < tol:
                            mp[xx, yy] = 0
                # close pinholes the keying punched in dark parts of the sign
                mask = mask.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))

            if FEATHER:
                mask = mask.filter(ImageFilter.GaussianBlur(FEATHER))

            cutout = im.copy().convert('RGBA')
            cutout.putalpha(mask)
            bbox = mask.getbbox()
            cutout = cutout.crop(bbox)

            # erase: stretch the sky band above the object down over its
            # outline, so the plate keeps a clean sky where the board was
            sy0, sy1 = o['sky_band']
            band = im.crop((bbox[0], sy0, bbox[2], sy1))
            fill = band.resize((bbox[2] - bbox[0], bbox[3] - bbox[1]), Image.BILINEAR)
            base.paste(fill, (bbox[0], bbox[1]), mask.crop(bbox))

            p = os.path.join(OUT, f"{stage}-{o['name']}.webp")
            cutout.save(p, 'WEBP', quality=92, method=6)
            print(f"{stage}-{o['name']}: {cutout.size} "
                  f"x={bbox[0]/w:.4f} y={bbox[1]/h:.4f} "
                  f"w={(bbox[2]-bbox[0])/w:.4f} h={(bbox[3]-bbox[1])/h:.4f} "
                  f"({os.path.getsize(p)} b)")

        bp = os.path.join(OUT, f'{stage}-base.webp')
        base.save(bp, 'WEBP', quality=88, method=6)
        print(f'{stage}-base: {base.size} ({os.path.getsize(bp)} b)')


if __name__ == '__main__':
    main()
