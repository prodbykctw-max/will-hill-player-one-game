#!/usr/bin/env python3
"""
Compose Will Hill's in-scope animations into one game-ready spritesheet.

Mirrors the Jandé project's tools/compose_bosses.py pattern: pack raw
per-animation AutoSprite exports (assets/raw-sprites/will-hill/<Anim>/) into
a single atlas under src/ for Vite to hash and bundle, plus a companion JSON
describing frame layout. Shared trim/pack/WebP logic lives in
tools/lib/compose_common.py (also used by tools/compose_enemy_sheet.py).

SOURCE CLIPS — TRUE SIDE VIEW (v1 SIDESCROLLER export)
------------------------------------------------------
These are rendered as a flat 2D side profile, facing SCREEN-RIGHT. The
renderer mirrors them for left-facing movement, so the source facing matches
its un-flipped default.

This replaced an earlier pass built on the export's `iso_*_right` clips. Those
were the least-bad option at the time — the export's *named* animations (Sword
Idle, Jog, Roll, Jump Start, Hit, Death, Punch, Kick...) are ALL rendered from
BEHIND, back of the cap, no face, which read as the character running away
from the player. The iso clips at least faced forward, but they are an
isometric 3/4 projection, and that had a visible cost in the game: standing
still, the far foot sits higher in the frame than the near one because it is
further back in 3D, so Will Hill's rear foot floated above the pavement. No
vertical offset can fix that — sinking the sprite just buries the planted
foot. It needed a real side projection, which is what these are.

Gaps this still leaves, all deliberate and marked below: there is no roll, hit
or death clip in this export, so those keys borrow rows that read acceptably.
Generating them is a follow-up.

Source frames are 96 per animation in a 10x10 grid of 256x256 cells (four
cells unused). See SOURCE_FRAMES/STRIDE below for why every 6th frame is
taken.

The character only ever occupies a sub-region of each 256x256 source cell.
Frames are cropped to a shared union bounding box — same box for every
frame, so the grid stays uniform and frame-to-frame motion doesn't jitter —
then saved as WebP (quality 92). q92 is visually indistinguishable from
lossless here and ~3x smaller; this is a photo-rendered character with fine
shading, not flat pixel art, so lossless WebP barely helps. atlas.json
records `origin` so anchor maths against the original AutoSprite coordinate
space still lines up.

Usage:
    python tools/compose_player_sheet.py

Requires Pillow (`pip install pillow`) with WebP support (the default wheel).
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib'))
from compose_common import load_grid_frames, union_bbox, pack_sheet, save_webp, write_atlas, measure_fit  # noqa: E402

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(REPO_ROOT, 'assets', 'raw-sprites', 'will-hill-pixel')
OUT_IMG = os.path.join(REPO_ROOT, 'src', 'assets', 'sprites', 'will-hill.webp')
OUT_JSON = os.path.join(REPO_ROOT, 'src', 'assets', 'sprites', 'will-hill.atlas.json')

SOURCE_CELL = 256
SOURCE_COLS = 10
# The v1 SIDESCROLLER export is a 10x10 grid with 96 populated cells, and each
# clip is ONE complete cycle over those 96 frames (measured: idle/walk/run all
# return to frame 0 by ~95; jump is a one-shot, which is why jumpStart and
# jumpLand are non-looping). Taking every 6th frame therefore reproduces the
# whole cycle in 16 — the same row length the sheet has always used, which
# keeps the packed texture at ~2900px wide. Going to 24 frames would push it
# past 4096 and break on the older mobile GPUs this has to run on.
SOURCE_FRAMES = 96
STRIDE = 6
FRAMES = SOURCE_FRAMES // STRIDE  # 16

# Unique source clips -> one sheet row each. (folder, rowKey, note)
ROWS = [
    ('idle', 'idle', 'pixel-art Will Hill, side view facing screen-right'),
    ('walk', 'walk', None),
    ('run',  'run',  None),
    ('jump', 'jump', None),
]

# Engine animation key -> which row it draws from. Several keys share a row
# where the export has no distinct side-facing clip for them.
KEY_MAP = {
    'idle': 'idle',
    'walk': 'walk',
    'jog': 'run',
    'run': 'run',
    'jumpStart': 'jump',
    'jumpLand': 'jump',
    'roll': 'run',    # TODO: no roll clip generated yet; run reads as a dash
    'hit': 'idle',    # TODO: no hit clip yet; the i-frame flicker carries it
    'death': 'idle',  # TODO: no death clip yet; the game-over overlay covers it
}

NON_LOOPING = {'jumpStart', 'jumpLand', 'death', 'roll'}


def main():
    frame_lists = {}
    for folder, row_key, _note in ROWS:
        src_path = os.path.join(RAW_DIR, folder, 'spritesheet.png')
        if not os.path.exists(src_path):
            raise SystemExit(
                f"Missing {src_path}\n"
                f"Extract '{folder}/spritesheet.png' from the AutoSprite export "
                f"into assets/raw-sprites/will-hill/{folder}/ first."
            )
        allf = load_grid_frames(src_path, SOURCE_COLS, SOURCE_CELL, SOURCE_FRAMES)
        frame_lists[row_key] = allf[::STRIDE]

    box = union_bbox(frame_lists, SOURCE_CELL)
    rows = [(row_key, frame_lists[row_key]) for _f, row_key, _n in ROWS]
    sheet, cell_w, cell_h = pack_sheet(rows, box, FRAMES)

    row_index = {row_key: i for i, (_f, row_key, _n) in enumerate(ROWS)}
    row_fit = {row_key: measure_fit(frame_lists[row_key], box) for _f, row_key, _n in ROWS}
    row_note = {row_key: note for _f, row_key, note in ROWS}

    animations = {}
    for key, row_key in KEY_MAP.items():
        animations[key] = {
            'row': row_index[row_key],
            'frameCount': FRAMES,
            'loop': key not in NON_LOOPING,
            'fit': row_fit[row_key],
        }
        if row_note[row_key]:
            animations[key]['note'] = row_note[row_key]

    # 'idle' is the standing reference pose the renderer sizes/anchors off.
    fit_ref = row_fit['idle']

    size = save_webp(sheet, OUT_IMG, quality=92)
    write_atlas(OUT_JSON, cell_w, cell_h, FRAMES, SOURCE_CELL, box[:2], animations, fit_ref)

    print(f"Trimmed cell: {cell_w}x{cell_h} (from {SOURCE_CELL}x{SOURCE_CELL} source, origin {box[0]},{box[1]})")
    print(f"Rows: {', '.join(r for _f, r, _n in ROWS)}")
    print(f"Wrote {OUT_IMG} ({sheet.width}x{sheet.height}, {size} bytes)")
    print(f"Wrote {OUT_JSON}")


if __name__ == '__main__':
    main()
