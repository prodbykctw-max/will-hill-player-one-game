#!/usr/bin/env python3
"""
Compose Will Hill's in-scope animations into one game-ready spritesheet.

Mirrors the Jandé project's tools/compose_bosses.py pattern: pack raw
per-animation AutoSprite exports (assets/raw-sprites/will-hill/<Anim>/) into
a single atlas under src/ for Vite to hash and bundle, plus a companion JSON
describing frame layout.

Source frames are 25 per animation (5x5 grid, 256x256 cells) — every source
sheet's frame 24 is a pixel-identical duplicate of frame 0 (a loop-closer),
so we drop it and use frames 0-23 (24 real frames) per animation.

Usage:
    python tools/compose_player_sheet.py

Requires Pillow (`pip install pillow`).
"""
import json
import os
from PIL import Image

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(REPO_ROOT, 'assets', 'raw-sprites', 'will-hill')
OUT_PNG = os.path.join(REPO_ROOT, 'src', 'assets', 'sprites', 'will-hill.png')
OUT_JSON = os.path.join(REPO_ROOT, 'src', 'assets', 'sprites', 'will-hill.atlas.json')

CELL = 256
FRAMES = 24  # frames 0-23; frame 24 duplicates frame 0 in every source sheet

# (raw AutoSprite folder name, engine animation key, optional note)
# See docs/GDD.md "Character asset pipeline" -> "Animation usage split" for
# why this is the in-scope set (no combat, no isometric).
ANIMATIONS = [
    ('Sword Idle',   'idle',        'functions as the base walk/idle loop despite the AutoSprite preset name'),
    ('Jog',          'jog',         None),
    ('Sprint Enter', 'sprintEnter', None),
    ('Sprint Exit',  'sprintExit',  None),
    ('Roll',         'roll',        None),
    ('Jump Start',   'jumpStart',   None),
    ('Jump Land',    'jumpLand',    None),
    ('Hit',          'hit',         None),
    ('Death',        'death',       None),
]


def main():
    cols = FRAMES
    rows = len(ANIMATIONS)
    sheet = Image.new('RGBA', (cols * CELL, rows * CELL), (0, 0, 0, 0))
    atlas = {'frameSize': [CELL, CELL], 'cols': cols, 'animations': {}}

    for row, (folder, key, note) in enumerate(ANIMATIONS):
        src_path = os.path.join(RAW_DIR, folder, 'spritesheet.png')
        if not os.path.exists(src_path):
            raise SystemExit(
                f"Missing {src_path}\n"
                f"Extract '{folder}/spritesheet.png' from the AutoSprite export "
                f"into assets/raw-sprites/will-hill/{folder}/ first."
            )
        src_im = Image.open(src_path).convert('RGBA')
        for i in range(FRAMES):
            sc, sr = i % 5, i // 5
            frame = src_im.crop((sc * CELL, sr * CELL, sc * CELL + CELL, sr * CELL + CELL))
            sheet.paste(frame, (i * CELL, row * CELL))
        atlas['animations'][key] = {'row': row, 'frameCount': FRAMES, 'loop': True}
        if note:
            atlas['animations'][key]['note'] = note

    os.makedirs(os.path.dirname(OUT_PNG), exist_ok=True)
    sheet.save(OUT_PNG, optimize=True)
    with open(OUT_JSON, 'w') as f:
        json.dump(atlas, f, indent=2)

    print(f"Wrote {OUT_PNG} ({sheet.width}x{sheet.height}, {os.path.getsize(OUT_PNG)} bytes)")
    print(f"Wrote {OUT_JSON}")


if __name__ == '__main__':
    main()
