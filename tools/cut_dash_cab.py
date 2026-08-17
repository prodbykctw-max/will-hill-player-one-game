#!/usr/bin/env python3
"""
Cut the client's dashboard concept into a MARTA cab frame for the live page.

⚠️ THIS CROPS THE EDGES. IT DOES NOT BLANK THE MIDDLE.

The first attempt at this painted over the screen area to produce one frame
image, and it swallowed the DOOR / BELL / LIGHTS / MAP / PA / WIPER / HVAC row,
the joystick and the gauge — the cab furniture that makes it read as a cab
rather than a border. The client caught it in one look: "Why did you cover up
the buttons on the marta and the switches on the dashboard?" So nothing here
writes a pixel over his painting; it only takes four crops from it.

WHY THE DASHBOARD IS A FRAME AND THE GAME PANELS ARE NOT
--------------------------------------------------------
In the game, OPTIONS and SETTINGS are his artwork outright — the painted
buttons ARE the buttons, with transparent hit targets over them (see
tools/cut_cabinet.py). That works because those screens have fixed content:
four buttons, three switches, one select.

The dashboard cannot work that way and it is not a stylistic choice. Every
value on it is live, the entrant table grows with the contest, and a score can
go from 3 digits to 7. A fixed painting has no way to hold that. So his cab
becomes the housing and the panels render inside it.

THE FOUR SLICES
---------------
  top    full width x 30px   the bezel above the screen
  lrail  92px x 48px         pure left rail, repeated down the page
  rrail  93px x 48px         pure right rail, repeated down the page
  bot    full width x 168px  the whole console: labels, buttons, joystick,
                             gauge and the MARTA wordmark

The rails are taken at y 300..348, which is 48 rows of uninterrupted metal —
far enough down to miss the top bezel's taper and clear of the console. They
repeat vertically, so the frame is correct however tall the page grows. A
single stretched image would smear the metal and squash the wordmark.

Output is base64 WebP printed as JSON, to be pasted into the `body` rule in
cloudflare/dashboard-worker.js. 27 KB for all four, which is why the page's
CSP only has to widen to `img-src data:` — no host is ever contacted.

Usage:
    python3 tools/cut_dash_cab.py > /tmp/rails.json
"""
import base64
import io
import json
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'ui-concept', 'dashboard-empty.png')

# (x0, y0, x1, y1) in the 853x1844 plate.
SLICES = {
    'top': (0, 0, 853, 30),
    'lrail': (0, 300, 92, 348),
    'rrail': (760, 300, 853, 348),
    'bot': (0, 1676, 853, 1844),
}


def main():
    im = Image.open(SRC).convert('RGB')
    W, H = im.size
    out = {}
    for key, box in SLICES.items():
        crop = im.crop(box)
        buf = io.BytesIO()
        crop.save(buf, 'WEBP', quality=90, method=6)
        out[key] = base64.b64encode(buf.getvalue()).decode()
        print(f'{key:6s} {crop.width}x{crop.height:<4d} '
              f'{len(out[key]) / 1024:5.1f} KB base64', file=sys.stderr)

    total = sum(len(v) for v in out.values()) / 1024
    print(f'total {total:.1f} KB', file=sys.stderr)
    print(f'left rail  {92 / W:.4f} of width', file=sys.stderr)
    print(f'right rail {(W - 760) / W:.4f} of width, starts {760 / W:.4f}',
          file=sys.stderr)
    print(f'console    {(H - 1676) / H:.4f} of height', file=sys.stderr)
    json.dump(out, sys.stdout)


if __name__ == '__main__':
    main()
