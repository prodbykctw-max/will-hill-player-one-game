#!/usr/bin/env python3
"""Derive the dark-background RARƎ AGENCY logo from the client's supplied
full-color lockup.

assets/brand/rare-agency/rare-agency-logo-full-color.png was drawn for a
white background and ships with no alpha channel — the RARƎ wordmark is
near-black, so composited straight onto the credits screen's black fill it
disappears. This script:

1. Alpha-mattes the logo off its white backing. The lockup only has two
   foreground families — a near-black wordmark (~26,26,28) and a saturated
   sky-blue (~97,173,239) for AGENCY, the frame and the triangle accent — so
   each pixel is classified by whether blue leads red (blue family) or the
   channels sit close together (black family, including anti-aliased edges
   against either color), and alpha is estimated from the channel with the
   largest gap from white for that family (red, for blue; mean luminance,
   for black).
2. Recolors the black family to the cream src/render/credits.js already
   uses for its own body text (#f2ead8) — a knockout/reversed variant is
   the ordinary way a mark ships for a dark ground. The blue family is left
   alone; it already reads fine on black.
3. Crops tightly to the matted bounding box and writes a lossless WebP,
   matching every other composed asset under src/assets/.

Re-run this if the source lockup ever changes — never hand-edit the output.

    python3 tools/matte_rare_agency.py
"""
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets/brand/rare-agency/rare-agency-logo-full-color.png"
OUT = ROOT / "src/assets/brand/rare-agency-logo.webp"

BLACK_TARGET = np.array([26.0, 26.0, 28.0])
BLUE_TARGET = np.array([97.0, 173.0, 239.0])
CREAM = np.array([242.0, 234.0, 216.0])  # #f2ead8 — credits.js's CREAM


def main():
    im = Image.open(SRC).convert("RGB")
    arr = np.array(im).astype(np.float32)
    R, G, B = arr[..., 0], arr[..., 1], arr[..., 2]

    is_blue_ish = (B - R) > 12

    mean_c = (R + G + B) / 3
    alpha_black = np.clip((255 - mean_c) / (255 - BLACK_TARGET[0]), 0, 1)
    alpha_blue = np.clip((255 - R) / (255 - BLUE_TARGET[0]), 0, 1)
    alpha = np.where(is_blue_ish, alpha_blue, alpha_black)
    alpha = np.where(alpha < 0.03, 0.0, alpha)  # kill background compression noise

    out = np.zeros_like(arr)
    for c in range(3):
        out[..., c] = np.where(is_blue_ish, BLUE_TARGET[c], CREAM[c])

    rgba = np.dstack([
        np.clip(out, 0, 255).astype(np.uint8),
        np.clip(alpha * 255, 0, 255).astype(np.uint8),
    ])
    result = Image.fromarray(rgba, "RGBA")

    pad = 10
    x0, y0, x1, y1 = result.getbbox()
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(result.width, x1 + pad), min(result.height, y1 + pad)
    result = result.crop((x0, y0, x1, y1))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    result.save(OUT, "WEBP", lossless=True, quality=100, method=6)
    print(f"wrote {OUT} ({result.size[0]}x{result.size[1]})")


if __name__ == "__main__":
    main()
