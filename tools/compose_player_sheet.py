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

Optimization pass: the character only ever occupies a sub-region of each
256x256 source cell (a global scan across all 216 frames found the union
bounding box). Frames are cropped to that shared box — same box for every
frame, so the grid stays uniform and frame-to-frame motion doesn't jitter —
then the sheet is saved as WebP (quality 92, alpha preserved) instead of
PNG for much better compression — this is a photo-rendered character with
fine shading, not flat pixel art, so lossless WebP barely helped (3.8MB
PNG -> 2.6MB lossless WebP) while q92 lossy is visually indistinguishable
and ~3x smaller than lossless (~0.9MB). atlas.json records `origin` (the
box's offset within the original 256x256 cell) so any anchor-point/pivot
math against the original AutoSprite coordinate space still lines up.

Usage:
    python tools/compose_player_sheet.py

Requires Pillow (`pip install pillow`) built with WebP support (the default
on the standard `pip install pillow` wheel).
"""
import json
import os
from PIL import Image

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(REPO_ROOT, 'assets', 'raw-sprites', 'will-hill')
OUT_IMG = os.path.join(REPO_ROOT, 'src', 'assets', 'sprites', 'will-hill.webp')
OUT_JSON = os.path.join(REPO_ROOT, 'src', 'assets', 'sprites', 'will-hill.atlas.json')
STALE_PNG = os.path.join(REPO_ROOT, 'src', 'assets', 'sprites', 'will-hill.png')

SOURCE_CELL = 256
FRAMES = 24  # frames 0-23; frame 24 duplicates frame 0 in every source sheet
PAD = 2  # small safety margin around the scanned bounding box

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


def load_source_frames():
    """Returns {folder: [24 PIL Images]}, one full 256x256 crop per frame."""
    frames = {}
    for folder, _, _ in ANIMATIONS:
        src_path = os.path.join(RAW_DIR, folder, 'spritesheet.png')
        if not os.path.exists(src_path):
            raise SystemExit(
                f"Missing {src_path}\n"
                f"Extract '{folder}/spritesheet.png' from the AutoSprite export "
                f"into assets/raw-sprites/will-hill/{folder}/ first."
            )
        im = Image.open(src_path).convert('RGBA')
        cells = []
        for i in range(FRAMES):
            sc, sr = i % 5, i // 5
            cells.append(im.crop((sc * SOURCE_CELL, sr * SOURCE_CELL,
                                   sc * SOURCE_CELL + SOURCE_CELL, sr * SOURCE_CELL + SOURCE_CELL)))
        frames[folder] = cells
    return frames


def union_bbox(frames):
    """Union non-transparent bounding box across every frame of every animation."""
    minx, miny, maxx, maxy = SOURCE_CELL, SOURCE_CELL, 0, 0
    for cells in frames.values():
        for cell in cells:
            bbox = cell.getbbox()
            if not bbox:
                continue
            x0, y0, x1, y1 = bbox
            minx, miny = min(minx, x0), min(miny, y0)
            maxx, maxy = max(maxx, x1), max(maxy, y1)
    # pad and clamp to the source cell
    minx = max(0, minx - PAD)
    miny = max(0, miny - PAD)
    maxx = min(SOURCE_CELL, maxx + PAD)
    maxy = min(SOURCE_CELL, maxy + PAD)
    return minx, miny, maxx, maxy


def main():
    frames = load_source_frames()
    minx, miny, maxx, maxy = union_bbox(frames)
    cell_w, cell_h = maxx - minx, maxy - miny

    cols = FRAMES
    rows = len(ANIMATIONS)
    sheet = Image.new('RGBA', (cols * cell_w, rows * cell_h), (0, 0, 0, 0))
    atlas = {
        'frameSize': [cell_w, cell_h],
        'cols': cols,
        'sourceCellSize': [SOURCE_CELL, SOURCE_CELL],
        'origin': [minx, miny],  # this box's offset within the original 256x256 AutoSprite cell
        'animations': {},
    }

    for row, (folder, key, note) in enumerate(ANIMATIONS):
        for i, cell in enumerate(frames[folder]):
            trimmed = cell.crop((minx, miny, maxx, maxy))
            sheet.paste(trimmed, (i * cell_w, row * cell_h))
        atlas['animations'][key] = {'row': row, 'frameCount': FRAMES, 'loop': True}
        if note:
            atlas['animations'][key]['note'] = note

    os.makedirs(os.path.dirname(OUT_IMG), exist_ok=True)
    sheet.save(OUT_IMG, 'WEBP', quality=92, method=6)
    with open(OUT_JSON, 'w') as f:
        json.dump(atlas, f, indent=2)

    if os.path.exists(STALE_PNG):
        os.remove(STALE_PNG)  # superseded by the .webp output

    print(f"Trimmed cell: {cell_w}x{cell_h} (from {SOURCE_CELL}x{SOURCE_CELL} source, origin {minx},{miny})")
    print(f"Wrote {OUT_IMG} ({sheet.width}x{sheet.height}, {os.path.getsize(OUT_IMG)} bytes)")
    print(f"Wrote {OUT_JSON}")


if __name__ == '__main__':
    main()
