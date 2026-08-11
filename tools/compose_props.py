#!/usr/bin/env python3
"""
Compose pickup props into game-ready WebP.

Source: AutoSprite `generate_asset_preview` (category=item, style=pixel,
quality=ultra) renders in assets/raw-props/, chosen to sit between the
background art's stylised-pixel look and the character sprites.

NOTE on the champagne bottle: the first generation came back wearing a real
drinks brand's trademark — wordmark, crown, the lot. That is not something to
ship on a public game asset, so it was regenerated with an explicitly blank
label. If this is ever regenerated, check the label again; the model reaches
for real brands unprompted.

Each render is trimmed to its content and saved at a modest resolution — the
game draws them a few dozen world-units tall, so the 1024px source is far
more than needed.

Usage:
    python tools/compose_props.py
"""
import os
from PIL import Image

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(REPO_ROOT, 'assets', 'raw-props')
OUT = os.path.join(REPO_ROOT, 'src', 'assets', 'props')

PROPS = [
    ('moneybag_raw.png', 'moneybag.webp', 168),
    ('champagne_raw.png', 'champagne.webp', 168),
]


def main():
    os.makedirs(OUT, exist_ok=True)
    for src_name, out_name, target_h in PROPS:
        src_path = os.path.join(SRC, src_name)
        if not os.path.exists(src_path):
            raise SystemExit(f'Missing {src_path}')
        im = Image.open(src_path).convert('RGBA')

        # These come back on a white card rather than transparent, so key it
        # out before trimming or the bbox is just the whole image.
        px = im.load()
        w, h = im.size
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if a > 0 and r > 238 and g > 238 and b > 238:
                    px[x, y] = (r, g, b, 0)

        bbox = im.getbbox()
        if bbox:
            im = im.crop(bbox)
        scale = target_h / im.height
        im = im.resize((max(1, round(im.width * scale)), target_h), Image.LANCZOS)

        out_path = os.path.join(OUT, out_name)
        im.save(out_path, 'WEBP', quality=92, method=6)
        print(f'{out_name}: {im.size} ({os.path.getsize(out_path)} bytes)')


if __name__ == '__main__':
    main()
