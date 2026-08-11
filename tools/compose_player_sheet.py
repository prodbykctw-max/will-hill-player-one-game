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
from compose_common import load_grid_frames, union_bbox, pack_flow, save_webp, write_atlas, measure_fit  # noqa: E402

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(REPO_ROOT, 'assets', 'raw-sprites', 'will-hill-pixel')
OUT_IMG = os.path.join(REPO_ROOT, 'src', 'assets', 'sprites', 'will-hill.webp')
OUT_JSON = os.path.join(REPO_ROOT, 'src', 'assets', 'sprites', 'will-hill.atlas.json')

SOURCE_CELL = 256
SOURCE_COLS = 10
SOURCE_FRAMES = 96   # 10x10 grid, four cells unused
GRID_COLS = 16       # packed sheet width, in frames

# WHICH SOURCE FRAMES EACH CLIP TAKES, AND WHY.
# Measured off the sheets, not guessed — see the numbers in each entry.
#
#   src   (start, stop, step) into the 96 source frames
#   ticks game ticks per drawn frame at 60Hz. Fractional is fine and is used:
#         it is how a clip keeps its original duration at a higher frame rate.
CLIPS = [
    # IDLE — the source runs THREE full breaths across its 96 frames (counted
    # by zero-crossings of the head-top bob). Playing all three in one cycle
    # at the old 16-frames/4-ticks made him breathe ~168 times a minute, which
    # is what read as panting. Taking ONE breath (frames 0-31) and giving it
    # 7.5 ticks a frame puts the cycle at 4.0s — about 15 breaths a minute,
    # a resting adult — and 32 frames keeps it smooth at that length.
    {'clip': 'idle', 'src': (0, 32, 1), 'ticks': 7.5, 'loop': True,
     'note': 'one breath of the side-view idle, ~4s'},

    # WALK — one full cycle across the 96 frames. The old 16 frames at 4 ticks
    # gave a 1.067s cycle and that pace was signed off, so the pace is kept
    # exactly and only the smoothness changes: 24 frames at 2.667 ticks is the
    # same 1.067s at 22.5fps instead of 15fps.
    {'clip': 'walk', 'src': (0, 96, 4), 'ticks': 2.667, 'loop': True},

    # RUN — one cycle. Faster than the walk, as a run should be: 24 frames at
    # 2 ticks is a 0.8s cycle at 30fps.
    {'clip': 'run', 'src': (0, 96, 4), 'ticks': 2.0, 'loop': True},

    # JUMP — the source is NOT one jump. It is SEVEN separate hops (airborne
    # runs measured at frames 0-1, 10-14, 23-27, 36-41, 54-58, 68-72, 84-88).
    # Sampling every 6th frame across all of them, as the first pass did, put
    # grounded and airborne poses next to each other and made him flail. Only
    # the longest clean arc is taken — 36-41, rising through an apex at 39 and
    # dropping back — and the player drives it from vertical velocity rather
    # than a timer, so the pose always matches what the physics is doing.
    {'clip': 'jump', 'src': (36, 42, 1), 'ticks': 4, 'loop': False,
     'driven': True, 'note': 'one arc: 0-1 rise, 2-3 apex, 4-5 fall'},
]

# Engine animation key -> which clip it draws from.
KEY_MAP = {
    'idle': 'idle',
    'walk': 'walk',
    'jog': 'run',
    'run': 'run',
    'jumpStart': 'jump',
    'jumpLand': 'jump',
    'roll': 'run',    # TODO: no roll clip generated yet; run reads as a dash
    'hit': 'idle',    # TODO: no hit clip yet; the stumble lurch carries it
    'death': 'idle',  # TODO: no death clip yet; the game-over overlay covers it
}

NON_LOOPING = {'jumpStart', 'jumpLand', 'death', 'roll'}


def main():
    frame_lists = {}
    for c in CLIPS:
        src_path = os.path.join(RAW_DIR, c['clip'], 'spritesheet.png')
        if not os.path.exists(src_path):
            raise SystemExit(
                f"Missing {src_path}\n"
                f"Drop the v1 SIDESCROLLER export's '{c['clip']}' sheet in as "
                f"assets/raw-sprites/will-hill-pixel/{c['clip']}/spritesheet.png "
                f"first (assets/ is git-ignored, so a fresh clone has none)."
            )
        allf = load_grid_frames(src_path, SOURCE_COLS, SOURCE_CELL, SOURCE_FRAMES)
        a, b, step = c['src']
        frame_lists[c['clip']] = allf[a:b:step]

    box = union_bbox(frame_lists, SOURCE_CELL)
    rows = [(c['clip'], frame_lists[c['clip']]) for c in CLIPS]
    sheet, cell_w, cell_h, starts = pack_flow(rows, box, GRID_COLS)

    clip_fit = {c['clip']: measure_fit(frame_lists[c['clip']], box) for c in CLIPS}
    by_clip = {c['clip']: c for c in CLIPS}

    animations = {}
    for key, clip in KEY_MAP.items():
        c = by_clip[clip]
        animations[key] = {
            'start': starts[clip],
            'frameCount': len(frame_lists[clip]),
            'loop': c['loop'] and key not in NON_LOOPING,
            'ticks': c['ticks'],
            'fit': clip_fit[clip],
        }
        if c.get('driven'):
            # The player sets the frame itself from vertical velocity; the
            # shared frame-advance helper must not tick this one.
            animations[key]['driven'] = True
        if c.get('note'):
            animations[key]['note'] = c['note']

    # 'idle' is the standing reference pose the renderer sizes/anchors off.
    size = save_webp(sheet, OUT_IMG, quality=92)
    # 0.014 matches what the enemy sheets get implicitly from their midpoint
    # anchor (drawH * (0.9921 - 0.9782)), so player and enemies plant at the
    # same depth in the pavement instead of Will Hill floating above them.
    write_atlas(OUT_JSON, cell_w, cell_h, GRID_COLS, SOURCE_CELL, box[:2],
                animations, clip_fit['idle'], anchor='low', sink=0.014)

    total = sum(len(f) for f in frame_lists.values())
    print(f"Trimmed cell: {cell_w}x{cell_h} (from {SOURCE_CELL}x{SOURCE_CELL}, origin {box[0]},{box[1]})")
    for c in CLIPS:
        n = len(frame_lists[c['clip']])
        print(f"  {c['clip']:5s} {n:3d} frames @ {c['ticks']} ticks "
              f"= {n * c['ticks'] / 60:.2f}s  start={starts[c['clip']]}")
    print(f"Packed {total} frames into {GRID_COLS} cols -> {sheet.width}x{sheet.height}")
    print(f"Wrote {OUT_IMG} ({size} bytes)")
    print(f"Wrote {OUT_JSON}")


if __name__ == '__main__':
    main()
