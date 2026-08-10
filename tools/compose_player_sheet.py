#!/usr/bin/env python3
"""
Compose Will Hill's in-scope animations into one game-ready spritesheet.

Mirrors the Jandé project's tools/compose_bosses.py pattern: pack raw
per-animation AutoSprite exports (assets/raw-sprites/will-hill/<Anim>/) into
a single atlas under src/ for Vite to hash and bundle, plus a companion JSON
describing frame layout. Shared trim/pack/WebP logic lives in
tools/lib/compose_common.py (also used by tools/compose_enemy_sheet.py).

Source frames are 25 per animation (5x5 grid, 256x256 cells) — every source
sheet's frame 24 is a pixel-identical duplicate of frame 0 (a loop-closer),
so we drop it and use frames 0-23 (24 real frames) per animation.

The character only ever occupies a sub-region of each 256x256 source cell
(a global scan across all 216 frames found the union bounding box). Frames
are cropped to that shared box — same box for every frame, so the grid stays
uniform and frame-to-frame motion doesn't jitter — then the sheet is saved
as WebP (quality 92, alpha preserved) instead of PNG for much better
compression — this is a photo-rendered character with fine shading, not flat
pixel art, so lossless WebP barely helped (3.8MB PNG -> 2.6MB lossless WebP)
while q92 lossy is visually indistinguishable and ~3x smaller than lossless
(~0.9MB). atlas.json records `origin` (the box's offset within the
original 256x256 cell) so any anchor-point/pivot math against the original
AutoSprite coordinate space still lines up.

Usage:
    python tools/compose_player_sheet.py

Requires Pillow (`pip install pillow`) built with WebP support (the default
on the standard `pip install pillow` wheel).
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib'))
from compose_common import load_grid_frames, union_bbox, pack_sheet, save_webp, write_atlas  # noqa: E402

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(REPO_ROOT, 'assets', 'raw-sprites', 'will-hill')
OUT_IMG = os.path.join(REPO_ROOT, 'src', 'assets', 'sprites', 'will-hill.webp')
OUT_JSON = os.path.join(REPO_ROOT, 'src', 'assets', 'sprites', 'will-hill.atlas.json')

SOURCE_CELL = 256
SOURCE_COLS = 5
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
    frame_lists = {}
    for folder, key, _note in ANIMATIONS:
        src_path = os.path.join(RAW_DIR, folder, 'spritesheet.png')
        if not os.path.exists(src_path):
            raise SystemExit(
                f"Missing {src_path}\n"
                f"Extract '{folder}/spritesheet.png' from the AutoSprite export "
                f"into assets/raw-sprites/will-hill/{folder}/ first."
            )
        frame_lists[key] = load_grid_frames(src_path, SOURCE_COLS, SOURCE_CELL, FRAMES)

    box = union_bbox(frame_lists, SOURCE_CELL)
    rows = [(key, frame_lists[key]) for _folder, key, _note in ANIMATIONS]
    sheet, cell_w, cell_h = pack_sheet(rows, box, FRAMES)

    animations = {}
    for row_i, (_folder, key, note) in enumerate(ANIMATIONS):
        animations[key] = {'row': row_i, 'frameCount': FRAMES, 'loop': True}
        if note:
            animations[key]['note'] = note

    size = save_webp(sheet, OUT_IMG, quality=92)
    write_atlas(OUT_JSON, cell_w, cell_h, FRAMES, SOURCE_CELL, box[:2], animations)

    print(f"Trimmed cell: {cell_w}x{cell_h} (from {SOURCE_CELL}x{SOURCE_CELL} source, origin {box[0]},{box[1]})")
    print(f"Wrote {OUT_IMG} ({sheet.width}x{sheet.height}, {size} bytes)")
    print(f"Wrote {OUT_JSON}")


if __name__ == '__main__':
    main()
