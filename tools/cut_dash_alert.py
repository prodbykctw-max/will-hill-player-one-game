#!/usr/bin/env python3
"""
Cut the dashboard's ON / ALERT switch out of his console, in both states.

Client: "their ability to turn on notification should be the alert switch
inside of the cab... it should be able to switch on and off with a click
sound for push notifications."

He already painted this switch — lower right rail of assets/ui-concept/
dashboard-empty.png, below the round ALERT lamp, its own rocker under the ON
label and lit red. tools/cut_dash_cab.py never reached it: the right rail on
the live page is a 48px metal tile (y300-348) repeated down the page, not
this section of the plate, so the switch was painted but never shipped.

ONE STATE, NOT TWO
-------------------
Unlike the map chips (cut_dash_chips.py, two real painted states to draw
from) he only ever painted this switch lit. The OFF state here is DERIVED,
same principle as the chips — his pixels, not new art — but a simpler
operation: the lamp is the only saturated red in the crop, so it is found by
color (R well above G and B) and pulled toward the switch's own dark bezel
metal, sampled from a corner of the same crop that is body, not lamp. Nothing
is drawn freehand; nothing outside the lamp itself is touched.

Output is base64 WebP printed as JSON, two sprites (on/off), pasted into the
style block in cloudflare/dashboard-worker.js.

Usage:
    python3 tools/cut_dash_alert.py > /tmp/alert.json
"""
import base64
import io
import json
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'ui-concept', 'dashboard-empty.png')

# (x0, y0, x1, y1) in the 853x1844 plate, measured off his artwork — the
# rocker switch itself, bezel to bezel, not the ON / ALERT lettering above
# and below it (those stay off-plate; the switch is composited standalone).
BOX = (784, 1428, 838, 1518)
METAL_SAMPLE = (2, 2, 8, 8)  # corner of the crop, known bezel, no lamp


def main():
    im = Image.open(SRC).convert('RGB')
    crop = im.crop(BOX)
    w, h = crop.size

    arr = np.asarray(crop).astype('float32')
    r, g, b = arr[..., 0], arr[..., 1], arr[..., 2]
    lampish = (r > g + 25) & (r > b + 25)
    print(f'lamp pixels: {int(lampish.sum())} / {w * h}', file=sys.stderr)

    mx0, my0, mx1, my1 = METAL_SAMPLE
    metal = arr[my0:my1, mx0:mx1].reshape(-1, 3).mean(axis=0)

    off_arr = arr.copy()
    for c in range(3):
        ch = off_arr[..., c]
        # Mostly his own bezel color, a little of the lit pixel kept so the
        # lamp housing still reads as a housing rather than vanishing flush
        # into the metal around it.
        ch[lampish] = metal[c] * 0.9 + ch[lampish] * 0.10
    off_img = Image.fromarray(np.clip(off_arr, 0, 255).astype('uint8'))

    out = {}
    for state, img in (('on', crop), ('off', off_img)):
        buf = io.BytesIO()
        img.save(buf, 'WEBP', quality=92, method=6)
        out[state] = base64.b64encode(buf.getvalue()).decode()
        print(f'{state:4s} {len(out[state]) / 1024:5.2f} KB base64',
              file=sys.stderr)

    W, H = im.size
    print(f'left {BOX[0] / W:.4f} top {BOX[1] / H:.4f} '
          f'width {(BOX[2] - BOX[0]) / W:.4f} height {(BOX[3] - BOX[1]) / H:.4f}',
          file=sys.stderr)
    json.dump(out, sys.stdout)


if __name__ == '__main__':
    main()
