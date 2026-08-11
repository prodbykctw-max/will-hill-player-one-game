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
#   src   (start, stop, step) into the source grid
#   grid  (cols, frames) of the SOURCE sheet, when it is not the v1
#         SIDESCROLLER export's 10x96. The reaction clips below were generated
#         one at a time against a 16-frame request and come back as 4x16 (or
#         5x24), so the geometry has to live on the clip rather than be one
#         module-level constant.
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

    # WALK — the source is NOT one stride. Autocorrelation puts the cycle at
    # 17 frames (seam 0.015, a clear minimum between 12 and 22), so the clip
    # holds 5.6 strides. Sampling evenly across the whole thing therefore
    # played nearly six strides per cycle: at 24 frames over 1.44s that was
    # 4.2 strides a second, which is why he read as running in place rather
    # than walking. Exactly the same mistake as the jump clip below.
    #
    # One cycle, timed to a real walking cadence: 17 frames at 3.85 ticks is
    # 1.09s per stride, ~55 strides a minute. Against WALK_SPEED that works
    # out to a 1.47m stride, which is what a person actually does.
    {'clip': 'walk', 'src': (0, 17, 1), 'ticks': 3.85, 'loop': True,
     'note': 'one stride of 17; the clip holds 5.6'},

    # RUN — same story, cycle measured at 10 frames (seam 0.037), so the clip
    # holds 9.6 of them. 10 frames at 3.0 ticks is 0.50s per stride against
    # RUN_SPEED, a 2.28m stride at ~120 strides a minute.
    {'clip': 'run', 'src': (0, 10, 1), 'ticks': 3.0, 'loop': True,
     'note': 'one stride of 10; the clip holds 9.6'},

    # JUMP — the source is NOT one jump. It is SEVEN separate hops (airborne
    # runs measured at frames 0-1, 10-14, 23-27, 36-41, 54-58, 68-72, 84-88).
    # Sampling every 6th frame across all of them, as the first pass did, put
    # grounded and airborne poses next to each other and made him flail. Only
    # the longest clean arc is taken — 36-41, rising through an apex at 39 and
    # dropping back — and the player drives it from vertical velocity rather
    # than a timer, so the pose always matches what the physics is doing.
    {'clip': 'jump', 'src': (36, 42, 1), 'ticks': 4, 'loop': False,
     'driven': True, 'note': 'one arc: 0-1 rise, 2-3 apex, 4-5 fall'},

    # ── REACTION CLIPS ────────────────────────────────────────────────────
    # Generated one at a time, later than the four above, so each is its own
    # 16- or 24-frame sheet rather than a slice of the 96-frame export.
    #
    # Every one of these prompts had to carry the same two guards, because
    # without them the generator draws the thing being reacted TO as well as
    # the reactor: "EXACTLY ONE person in every frame, never a duplicate" and
    # "nothing lies on the ground". The rejected enemy attempt (kept in
    # docs/LESSONS.md) came back with a second body lying under the first.

    # HIT — the recoil, with a comic impact flash drawn in at frames 1-2.
    # The source holds the settled pose from frame 8 to 23 (bbox static to
    # within 2px), so only the first 10 frames carry motion and the rest are
    # dropped. 10 frames at 1.2 ticks is exactly 12 ticks, which is the width
    # of the hit-reaction window player.js opens (inv > CONTACT_IFRAMES - 12).
    {'clip': 'hit', 'src': (0, 10, 1), 'grid': (5, 24), 'ticks': 1.2,
     'loop': False, 'note': 'recoil + impact flash; source settles after f8'},

    # DOWNED — lying on the street while he gets stomped out. Loops, because
    # the knockdown runs 98 ticks (GATHER 24 + STOMP 44 + FLEE 30, see
    # entities/knockdown.js) and 16 frames at 6 ticks is 96 — one pass, near
    # enough that it never visibly restarts.
    #
    # groundFit: this clip's OWN lowest pixel is its ground contact, so the
    # renderer must plant it on that rather than on the standing reference.
    # Measured, not assumed: a body lying down reaches only 0.9283 of the cell
    # height where the idle reaches 0.9841, and against a 180.6-unit draw
    # height that gap is 10.1 world units — a third of a tile of daylight
    # under a man who is supposed to be flat on the street.
    {'clip': 'downed', 'src': (0, 16, 1), 'grid': (4, 16), 'ticks': 6,
     'loop': True, 'groundFit': True,
     'note': 'lying on the ground through the knockdown, ~1.6s'},

    # KNOCKBACK — the Sonic bounce: a full tumble away from whatever hit him.
    {'clip': 'knockback', 'src': (0, 16, 1), 'grid': (4, 16), 'ticks': 3,
     'loop': False, 'note': 'one tumble, 0.80s'},

    # FALL — dropping through a hole in the street, arms up, legs kicking,
    # nothing beneath him. TIMED TO THE ACTUAL DROP: the street surface is
    # FLOOR_R*T = 448 and FALL_DEATH_Y is 854, so the fall is 406 world units
    # at TERMINAL_VY 16 — about 27 ticks. 16 frames at 2 ticks is 32, so he
    # gets through most of one tumble on the way down and never loops back to
    # the start mid-drop.
    {'clip': 'fall', 'src': (0, 16, 1), 'grid': (4, 16), 'ticks': 2,
     'loop': True, 'note': 'tumbling down a hole; the drop lasts ~27 ticks'},
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
    'hit': 'hit',
    'knockback': 'knockback',
    'fall': 'fall',
    'knockdown': 'downed',
    'death': 'downed',
}

NON_LOOPING = {'jumpStart', 'jumpLand', 'death', 'roll', 'hit', 'knockback'}


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
        cols, total = c.get('grid', (SOURCE_COLS, SOURCE_FRAMES))
        allf = load_grid_frames(src_path, cols, SOURCE_CELL, total)
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
        if c.get('groundFit'):
            # Plant on this clip's own lowest pixel instead of the standing
            # reference's. Opt-in, NOT the default: an airborne clip's lowest
            # pixel is meant to sit below the anchor (the jump tucks its feet
            # up, and pinning them to the collider floor would look like he
            # never leaves the ground), so only clips whose contact point IS
            # the pavement may ask for this.
            animations[key]['ownFit'] = True
        if c.get('note'):
            animations[key]['note'] = c['note']

    # 'idle' is the standing reference pose the renderer sizes/anchors off.
    size = save_webp(sheet, OUT_IMG, quality=92)
    # `anchor: low` is all the atlas needs to say — a true side profile has
    # both feet level, so it anchors on the lowest pixel. How deep that pixel
    # then sits in the pavement is PLANT_DEPTH's job, in src/world/scale.js,
    # so it is one number shared with every other character rather than a
    # per-sheet fudge that can drift out of agreement.
    write_atlas(OUT_JSON, cell_w, cell_h, GRID_COLS, SOURCE_CELL, box[:2],
                animations, clip_fit['idle'], anchor='low')

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
