#!/usr/bin/env python3
"""
Cut the two long tables' painted headings out of the client's dashboard.

WHY THIS EXISTS
---------------
He asked: "what about the ability to scroll once this fills up?" The four
lists on the page do scroll — they always did — but two of the windows he
painted are tiny. Measured on his own plate:

    ALL ENTRANTS       body y1487..1550   63px   ~3 rows
    RECENT REJECTIONS  body y1621..1667   46px   ~2 rows

Reading 50 entrants three at a time on payout day is not reading them. So
tapping either heading opens that table full-screen — and the heading of the
full-screen view is THIS CROP: his panel border, his title, his column
headings, his rule. Not a re-lettered copy.

    "you keep trying to sneak in your artwork... I want you to use that image"

The strips are 626px wide, which is their natural width in the 853-wide plate.
The overlay lays them out at exactly that size and pans horizontally on a
narrower phone, so the lettering stays at the size he drew it and the data
columns underneath line up with the headings above them.

Output is base64 WebP printed as JSON, pasted into the style block in
cloudflare/dashboard-worker.js. No host is contacted; the page's CSP only
allows `img-src data:`.

Usage:
    python3 tools/cut_dash_heads.py > /tmp/heads.json
"""
import base64
import io
import json
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'ui-concept', 'dashboard-empty.png')

# (x0, y0, x1, y1) in the 853x1844 plate. x111..737 is the panel's own border,
# measured off the plate (the border row at y1411 runs bright from 111 to 736).
# Each strip ends on the rule he drew under the column headings.
STRIPS = {
    'ent': (111, 1411, 737, 1487),   # ALL ENTRANTS + RANK..LAST PLAYED + rule
    'rej': (111, 1560, 737, 1621),   # RECENT REJECTIONS + TIME/REASON/DETAIL
}


def main():
    im = Image.open(SRC).convert('RGB')
    out = {}
    for key, box in STRIPS.items():
        crop = im.crop(box)
        buf = io.BytesIO()
        crop.save(buf, 'WEBP', quality=92, method=6)
        out[key] = base64.b64encode(buf.getvalue()).decode()
        print(f'{key} {crop.width}x{crop.height} '
              f'{len(out[key]) / 1024:.1f} KB base64', file=sys.stderr)
    json.dump(out, sys.stdout)


if __name__ == '__main__':
    main()
