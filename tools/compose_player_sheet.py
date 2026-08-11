#!/usr/bin/env python3
"""
Compose Will Hill's in-scope animations into one game-ready spritesheet.

Mirrors the Jandé project's tools/compose_bosses.py pattern: pack raw
per-animation AutoSprite exports (assets/raw-sprites/will-hill/<Anim>/) into
a single atlas under src/ for Vite to hash and bundle, plus a companion JSON
describing frame layout. Shared trim/pack/WebP logic lives in
tools/lib/compose_common.py (also used by tools/compose_enemy_sheet.py).

WHICH SOURCE CLIPS, AND WHY THE ISO ONES
----------------------------------------
The AutoSprite export's *named* animations (Sword Idle, Jog, Roll, Jump
Start, Hit, Death, Punch, Kick...) are ALL rendered from BEHIND — back of
the cap, no face. Composed into a side-scroller they read as the character
running away from the player, which is exactly what went wrong in the first
pass.

The `iso_*_right` clips, despite the "iso" prefix, are true side views
facing SCREEN-RIGHT — face, glasses and chain all visible — which is what a
side-scroller actually needs. So locomotion comes from those. The renderer
mirrors them for left-facing movement, so the source facing (right) matches
its un-flipped default.

Gaps this leaves, all deliberate and marked below: there is no side-facing
roll, hit, or death in the export. `roll` and `hit` borrow side-facing clips
that read acceptably; only `death` keeps a rear-view clip, since it plays
once and is covered by the game-over overlay almost immediately. Generating
proper side-facing roll/hit/death is a follow-up.

Source frames are 25 per animation (5x5 grid, 256x256 cells). The rear-view
sheets close their loop with a duplicate of frame 0 at index 24; the iso
sheets do not. 24 frames is used uniformly — that drops only the duplicate
on the former and one frame on the latter, which is imperceptible in a
24-frame cycle and keeps every row the same width.

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
RAW_DIR = os.path.join(REPO_ROOT, 'assets', 'raw-sprites', 'will-hill')
OUT_IMG = os.path.join(REPO_ROOT, 'src', 'assets', 'sprites', 'will-hill.webp')
OUT_JSON = os.path.join(REPO_ROOT, 'src', 'assets', 'sprites', 'will-hill.atlas.json')

SOURCE_CELL = 256
SOURCE_COLS = 5
FRAMES = 24

# Unique source clips -> one sheet row each. (folder, rowKey, note)
ROWS = [
    ('iso_idle_right_right', 'idle', 'side view facing screen-right; the named "Sword Idle" clip is a rear view'),
    ('iso_walk_right_right', 'walk', None),
    ('iso_run_right_right',  'run',  None),
    ('iso_jump_right_right', 'jump', None),
    ('Death',                'death', 'ONLY rear-view clip kept — plays once and the game-over overlay covers it'),
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
    'roll': 'run',    # TODO: no side-facing roll in the export; run reads as a dash
    'hit': 'idle',    # TODO: no side-facing hit; the i-frame flicker carries it
    'death': 'death',
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
        frame_lists[row_key] = load_grid_frames(src_path, SOURCE_COLS, SOURCE_CELL, FRAMES)

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
