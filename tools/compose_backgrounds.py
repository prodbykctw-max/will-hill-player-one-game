#!/usr/bin/env python3
"""
Compress the 4 stage background references into game-ready WebP backdrops.

Source: assets/backgrounds/<stage>/reference.png (git-ignored raw refs, see
docs/GDD.md "Visual style & background references"). These are single
"postcard" compositions, not seamless scrolling panoramas (see PHASE 2 of
the plan) — for this pass they're used as fixed/slow-parallax backdrops
behind the procedurally-generated tile foreground, not tiled/scrolling art.

Output: src/assets/backgrounds/<stage>.webp (quality 88, opaque — no alpha
needed for a backdrop). Re-run any time a reference image is replaced.

Usage:
    python tools/compose_backgrounds.py
"""
import os
from PIL import Image

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(REPO_ROOT, 'assets', 'backgrounds')
OUT_DIR = os.path.join(REPO_ROOT, 'src', 'assets', 'backgrounds')

STAGES = ['eav', 'edgewood', 'l5p', 'underground']


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for stage in STAGES:
        src_path = os.path.join(SRC_DIR, stage, 'reference.png')
        if not os.path.exists(src_path):
            print(f"Skipping {stage}: no reference at {src_path}")
            continue
        im = Image.open(src_path).convert('RGB')
        out_path = os.path.join(OUT_DIR, f'{stage}.webp')
        im.save(out_path, 'WEBP', quality=88, method=6)
        print(f"{stage}: {im.size} -> {out_path} ({os.path.getsize(out_path)} bytes)")


if __name__ == '__main__':
    main()
