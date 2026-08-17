#!/usr/bin/env python3
"""
Cut the dashboard's three VIEW chips into ON and OFF states, from his pixels.

THE PROBLEM
-----------
He painted the map's view switch once, in one state: WORLD lit amber with dark
lettering, NORTH AMERICA and ATLANTA unlit outlines with light lettering. The
switch has to move — "none of that is a button that I can touch, that needs to
be touchable to also look at the map" — and the moment ATLANTA is the live view
his painted WORLD chip is still the lit one, which reads as a broken control.

WHAT THIS DOES NOT DO
---------------------
It does not letter anything. Every glyph in every output is HIS glyph, at his
size, in his position inside its own chip. Only two things are synthesised, and
both are lifted from his own painting:

  the lit body    -- his WORLD chip with its lettering inpainted away, so what
                     is left is his amber pill and nothing else
  the unlit body  -- his ATLANTA chip with its lettering inpainted away, so
                     what is left is his outlined pill and nothing else

Each body is then stretched to the width of the chip being built and that
chip's own glyph mask is stamped back into it, in his dark-on-amber or his
light-on-dark. Same technique as the settings pills: his knob, moved.

Inpainting is a per-row median of the body pixels that are NOT lettering,
which works here because both pills are a near-flat fill with a soft vertical
gradient. Nothing is drawn freehand.

Output is base64 WebP printed as JSON, six sprites, pasted into the style block
in cloudflare/dashboard-worker.js.

Usage:
    python3 tools/cut_dash_chips.py > /tmp/chips.json
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

# (x0, y0, x1, y1) in the 853x1844 plate, measured off his artwork.
CHIPS = {
    'world': (173, 782, 228, 810),
    'us': (232, 782, 333, 810),
    'atl': (341, 782, 407, 810),
}
LIT_FROM = 'world'      # the one chip he painted lit
UNLIT_FROM = 'atl'      # the cleanest unlit chip (shortest word, most body)


INSET = 5   # rows/cols of pill border that are never lettering


def glyph_alpha(crop, lit):
    """His lettering, as a 0..1 coverage map rather than a hard mask.

    A boolean mask stamps the glyphs back with jagged edges and a bolder
    weight than he drew — his type is anti-aliased, and half-lit edge pixels
    either round on (fat) or off (ragged). Coverage keeps the edge, so the
    rebuilt chip reads as the same lettering at the same weight.
    """
    a = np.asarray(crop.convert('RGB')).astype(int)
    lum = a.sum(2)
    inner = lum[INSET:-INSET, INSET:-INSET]
    body = np.median(inner)
    ink = np.percentile(inner, 2 if lit else 98)
    span = max(40.0, abs(ink - body))
    cov = np.clip((body - lum) / span, 0, 1) if lit else \
        np.clip((lum - body) / span, 0, 1)
    out = np.zeros_like(cov)
    out[INSET:-INSET, INSET:-INSET] = cov[INSET:-INSET, INSET:-INSET]
    return out


def inpaint(crop, cov):
    """Replace the lettering with the row's own body colour."""
    a = np.asarray(crop.convert('RGB')).astype(int).copy()
    lettering = cov > 0.12
    for y in range(a.shape[0]):
        keep = a[y][~lettering[y]]
        if len(keep) == 0:
            continue
        a[y][lettering[y]] = np.median(keep, axis=0).astype(int)
    return Image.fromarray(a.astype(np.uint8))


def main():
    im = Image.open(SRC).convert('RGB')
    crops = {k: im.crop(box) for k, box in CHIPS.items()}
    covs = {k: glyph_alpha(c, k == LIT_FROM) for k, c in crops.items()}

    lit_body = inpaint(crops[LIT_FROM], covs[LIT_FROM])
    unlit_body = inpaint(crops[UNLIT_FROM], covs[UNLIT_FROM])

    # His two ink colours, sampled from the chips they belong to — the mean of
    # the pixels his lettering fully covers, so anti-aliased edges do not drag
    # the value toward the body.
    la = np.asarray(crops[LIT_FROM].convert('RGB')).astype(float)
    ua = np.asarray(crops[UNLIT_FROM].convert('RGB')).astype(float)
    lit_ink = la[covs[LIT_FROM] > 0.85].mean(0)
    unlit_ink = ua[covs[UNLIT_FROM] > 0.85].mean(0)
    print(f'lit ink {lit_ink.round(0)}  unlit ink {unlit_ink.round(0)}',
          file=sys.stderr)

    out = {}
    for key, box in CHIPS.items():
        w, h = box[2] - box[0], box[3] - box[1]
        cov = covs[key][:, :, None]
        for state, body, ink in (('on', lit_body, lit_ink),
                                 ('off', unlit_body, unlit_ink)):
            a = np.asarray(body.resize((w, h), Image.LANCZOS)).astype(float)
            a = a * (1 - cov) + ink[None, None, :] * cov
            buf = io.BytesIO()
            Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save(
                buf, 'WEBP', quality=94, method=6)
            name = f'{key}-{state}'
            out[name] = base64.b64encode(buf.getvalue()).decode()
            print(f'{name:10s} {w}x{h} {len(out[name]) / 1024:.1f} KB base64',
                  file=sys.stderr)

    json.dump(out, sys.stdout)


if __name__ == '__main__':
    main()
