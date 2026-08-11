#!/usr/bin/env python3
"""
Compose the street enemy's 3 animations into one game-ready spritesheet.

Source: generated via the autosprite MCP (upload_character + generate_spritesheet)
from the confirmed enemy concept art (assets/enemies/palette-variations-A-B-C.png,
Variation A cropped as the reference). See docs/GDD.md "Enemy design" for the
confirmed design (single archetype, 3 palette variants — only A is shipped
this pass; B/C are a cheap recolor follow-up).

3 animations, 16 frames each (4x4 grid, 256x256 cells), no loop-closer
duplicate frame (unlike Will Hill's export) so all 16 frames are used:
  - idle   -> patrol idle stance
  - walk   -> patrol walk cycle
  - defeat -> stomp/collapse reaction (the enemy's only "hurt" state — no
              combat, so no hit/block/attack animations needed)

Same trim + WebP-92 pipeline as tools/compose_player_sheet.py, via
tools/lib/compose_common.py.

Usage:
    python tools/compose_enemy_sheet.py
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib'))
from compose_common import load_grid_frames, union_bbox, pack_sheet, save_webp, write_atlas, measure_fit  # noqa: E402

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(REPO_ROOT, 'assets', 'raw-sprites', 'enemy')
OUT_IMG = os.path.join(REPO_ROOT, 'src', 'assets', 'sprites', 'enemy.webp')
OUT_JSON = os.path.join(REPO_ROOT, 'src', 'assets', 'sprites', 'enemy.atlas.json')

SOURCE_CELL = 256
SOURCE_COLS = 4
FRAMES = 16

ANIMATIONS = [
    ('idle',   'idle',   True,  None),
    ('walk',   'walk',   True,  None),
    ('defeat', 'defeat', False, 'plays once when stomped, then the enemy despawns'),
]


def main():
    frame_lists = {}
    for folder, key, _loop, _note in ANIMATIONS:
        src_path = os.path.join(RAW_DIR, folder, 'spritesheet.png')
        if not os.path.exists(src_path):
            raise SystemExit(
                f"Missing {src_path}\n"
                f"Download '{folder}/spritesheet.png' from the autosprite job "
                f"into assets/raw-sprites/enemy/{folder}/ first."
            )
        frame_lists[key] = load_grid_frames(src_path, SOURCE_COLS, SOURCE_CELL, FRAMES)

    box = union_bbox(frame_lists, SOURCE_CELL)
    rows = [(key, frame_lists[key]) for _folder, key, _loop, _note in ANIMATIONS]
    sheet, cell_w, cell_h = pack_sheet(rows, box, FRAMES)

    animations = {}
    for row_i, (_folder, key, loop, note) in enumerate(ANIMATIONS):
        animations[key] = {'row': row_i, 'frameCount': FRAMES, 'loop': loop,
                           'fit': measure_fit(frame_lists[key], box)}
        if note:
            animations[key]['note'] = note

    # 'idle' is the standing reference pose the renderer sizes/anchors off.
    fit_ref = animations['idle']['fit']

    size = save_webp(sheet, OUT_IMG, quality=92)
    write_atlas(OUT_JSON, cell_w, cell_h, FRAMES, SOURCE_CELL, box[:2], animations, fit_ref)

    print(f"Trimmed cell: {cell_w}x{cell_h} (from {SOURCE_CELL}x{SOURCE_CELL} source, origin {box[0]},{box[1]})")
    print(f"Wrote {OUT_IMG} ({sheet.width}x{sheet.height}, {size} bytes)")
    print(f"Wrote {OUT_JSON}")


if __name__ == '__main__':
    main()
