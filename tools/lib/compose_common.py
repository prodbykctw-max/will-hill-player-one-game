"""
Shared spritesheet-composition helpers, factored out of tools/compose_player_sheet.py
so tools/compose_enemy_sheet.py (and any future compose script) doesn't
duplicate the trim/pack/WebP-save logic.

Pipeline shape: load N frames per animation from a raw source grid -> find
the union non-transparent bounding box across every frame of every animation
-> crop every frame to that same box (keeps the grid uniform, no per-frame
jitter) -> pack into one row-per-animation sheet -> save as WebP.
"""
import json
import os
from PIL import Image


def load_grid_frames(sheet_path, cols, cell, frame_count):
    """Load `frame_count` frames from a `cols`-column grid of `cell`x`cell`
    cells in the image at `sheet_path`. Returns a list of PIL Images."""
    im = Image.open(sheet_path).convert('RGBA')
    frames = []
    for i in range(frame_count):
        c, r = i % cols, i // cols
        frames.append(im.crop((c * cell, r * cell, c * cell + cell, r * cell + cell)))
    return frames


def union_bbox(frame_lists, source_cell, pad=2):
    """Union non-transparent bounding box across every frame in every list
    in `frame_lists` (a dict or list of lists of PIL Images). Padded and
    clamped to [0, source_cell]."""
    lists = frame_lists.values() if isinstance(frame_lists, dict) else frame_lists
    minx, miny, maxx, maxy = source_cell, source_cell, 0, 0
    for frames in lists:
        for f in frames:
            bbox = f.getbbox()
            if not bbox:
                continue
            x0, y0, x1, y1 = bbox
            minx, miny = min(minx, x0), min(miny, y0)
            maxx, maxy = max(maxx, x1), max(maxy, y1)
    minx = max(0, minx - pad)
    miny = max(0, miny - pad)
    maxx = min(source_cell, maxx + pad)
    maxy = min(source_cell, maxy + pad)
    return minx, miny, maxx, maxy


def pack_sheet(rows, box, frame_count):
    """`rows`: ordered list of (key, frames) pairs, each `frames` a list of
    `frame_count` PIL Images already in source-cell coordinates. Crops every
    frame to `box` and packs into a grid: one row per animation, one column
    per frame. Returns (sheet_image, cell_w, cell_h)."""
    minx, miny, maxx, maxy = box
    cell_w, cell_h = maxx - minx, maxy - miny
    cols = frame_count
    sheet = Image.new('RGBA', (cols * cell_w, len(rows) * cell_h), (0, 0, 0, 0))
    for row_i, (_key, frames) in enumerate(rows):
        for i, f in enumerate(frames):
            trimmed = f.crop((minx, miny, maxx, maxy))
            sheet.paste(trimmed, (i * cell_w, row_i * cell_h))
    return sheet, cell_w, cell_h


def save_webp(image, out_path, quality=92):
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    image.save(out_path, 'WEBP', quality=quality, method=6)
    return os.path.getsize(out_path)


def write_atlas(out_path, cell_w, cell_h, cols, source_cell, origin, animations):
    """`animations`: dict of {key: {row, frameCount, loop, [note]}}."""
    atlas = {
        'frameSize': [cell_w, cell_h],
        'cols': cols,
        'sourceCellSize': [source_cell, source_cell],
        'origin': list(origin),
        'animations': animations,
    }
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w') as f:
        json.dump(atlas, f, indent=2)
