#!/usr/bin/env python3
"""The backdrop plates' repeat join.

`drawPlate` in src/render/backdrop.js tiles each plate straight — not
mirrored, deliberately, because these are real Atlanta streetscapes and a
flipped copy renders CITGO and WELCOME TO EAST ATLANTA as backwards text.
Straight repeat means the plate's last column butts against its first. The
client, walking EAV: *"it looks like there's a layering issue with repeating
the image."*

TWO DIFFERENT THINGS LOOK LIKE ONE PROBLEM, and only one of them was worth
fixing. Measured before touching anything (see docs/HANDOFF.md):

  1. CORRUPT EDGE COLUMNS. `l5p-base` opens with a column at luma 252 and a
     second at 143 in front of a plate whose next column is 8.7 — a white
     line, on every row, 94x the plate's own 95th-percentile column step. It
     is not content, it is a resampling artifact left at the frame border by
     whatever produced the plate. Repeated every plate width, it is a bright
     vertical line down the screen. `edgewood-base` and `underground-base`
     have milder versions at their own borders.

  2. THE CONTENT DISCONTINUITY — the plate's right end genuinely not
     following on from its left end. Real, and much less visible than it
     sounds: at real-world scale a plate is 480-1350px wide against a 430px
     canvas, so EAV's join never once reaches the screen in a 360-column
     stage, and Underground's scores BELOW that plate's own 99th-percentile
     column step, i.e. under the painted architecture it sits among.

This tool fixes (1), which is a defect. It can also do (2) with `--cut`, but
read the note on that flag before reaching for it.

Usage:
    python3 tools/fix_seam.py --measure      # score everything, change nothing
    python3 tools/fix_seam.py --repair       # fix corrupt edge columns
    python3 tools/fix_seam.py --repair --dry-run
    python3 tools/fix_seam.py --selftest
"""

import argparse
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
BG = ROOT / 'src' / 'assets' / 'backgrounds'
STAGES_JS = ROOT / 'src' / 'world' / 'stages.js'

# Encoder settings copied from tools/cut_planes.py, so a repaired file is
# re-encoded exactly the way it was produced. Nothing here is a new choice.
Q_BASE, Q_CARD = 92, 94


def shipped_files():
    """Every plate the game actually loads, grouped by stage.

    Read out of stages.js rather than globbed. `eav-day.webp` and `eav.webp`
    are uncut originals kept for reference and they both match `eav-*`; a
    glob would have handed them to the cutter alongside the real cards.
    """
    src = STAGES_JS.read_text()
    names = re.findall(r"from '\.\./assets/backgrounds/([^']+\.webp)'", src)
    stages, seen = {}, set()
    for n in names:
        if n in seen:
            continue
        seen.add(n)
        stem = n[:-5]
        # Longest stage prefix wins, so eav-day-clouds binds to eav-day.
        for st in ('eav-day', 'edgewood-day', 'l5p-day', 'underground-day',
                   'eav', 'edgewood', 'l5p', 'underground'):
            if stem == f'{st}-base' or stem.startswith(f'{st}-'):
                stages.setdefault(st, {'base': None, 'cards': []})
                if stem == f'{st}-base':
                    stages[st]['base'] = BG / n
                else:
                    stages[st]['cards'].append(BG / n)
                break
    return stages


# ── the profile a corrupt column shows up in ──────────────────────────────
def column_profile(path):
    """Mean luma per column, and the plate's own typical column step.

    For a card this is premultiplied by alpha: a transparent column has no
    colour worth measuring, and comparing a card's RGB where it is invisible
    finds "anomalies" in whatever the cutter happened to leave behind.
    """
    im = Image.open(path)
    a = np.asarray(im.convert('RGBA'), dtype=np.float64)
    rgb, al = a[:, :, :3], a[:, :, 3:4] / 255.0
    prof = (rgb * al).mean(axis=(0, 2))
    steps = np.abs(np.diff(prof))
    inner = steps[3:-3] if steps.size > 8 else steps
    return prof, float(np.percentile(inner, 95)) if inner.size else 0.0


# A column is CORRUPT, not content, when the step between it and the next
# column inward is both a large multiple of what this plate does anywhere
# else AND large in absolute terms. The multiple alone trips on very smooth
# plates where p95 is a fraction of a level; the absolute alone trips on
# busy ones. Only the outermost two columns are ever considered — a border
# artifact is a border artifact, and anything deeper is the painting.
STEP_RATIO = 8.0
STEP_FLOOR = 6.0
MAX_DEPTH = 2


def corrupt_columns(prof, p95):
    """(left_count, right_count) of columns to throw away."""
    thr = max(STEP_FLOOR, STEP_RATIO * p95)
    left = 0
    for k in range(MAX_DEPTH):
        if abs(prof[k] - prof[k + 1]) > thr:
            left = k + 1
    right = 0
    for k in range(MAX_DEPTH):
        if abs(prof[-1 - k] - prof[-2 - k]) > thr:
            right = k + 1
    return left, right


def repair(path, left, right, dry_run=False):
    """Clamp: the first good column is copied outward over the bad ones.

    Not interpolated and not cropped. Cropping would change the plate's
    width, and every `span`, `xRanges` and `light.x` in stages.js is a
    FRACTION of that width — a two-column crop would slide every lamp glow
    off its lamp. Clamping keeps the coordinate system exactly as it is and
    only replaces pixels that were never real.
    """
    im = Image.open(path)
    a = np.asarray(im.convert('RGBA')).copy()
    if left:
        a[:, :left, :] = a[:, left:left + 1, :]
    if right:
        a[:, -right:, :] = a[:, -right - 1:-right, :]
    if dry_run:
        return
    img = Image.fromarray(a, 'RGBA')
    if path.name.endswith('-base.webp'):
        img = img.convert('RGB')
        img.save(path, 'WEBP', quality=Q_BASE, method=6)
    else:
        img.save(path, 'WEBP', quality=Q_CARD, method=6)


# ── measurement ───────────────────────────────────────────────────────────
def seam_score(path):
    """How far the last column is from the first, in units of this plate's
    own median column step. Relative on purpose: a plate full of hard
    architectural edges has big steps everywhere, so an absolute difference
    at the join says nothing about whether the join stands out."""
    a = np.asarray(Image.open(path).convert('RGB'), dtype=np.float64)
    join = float(np.abs(a[:, -1, :] - a[:, 0, :]).mean())
    steps = np.abs(np.diff(a, axis=1)).mean(axis=(0, 2))
    med = float(np.median(steps))
    return join, med, join / max(med, 1e-6)


def do_measure():
    stages = shipped_files()
    print(f'{"plate":22s} {"w":>5s} {"join":>7s} {"median step":>12s} {"ratio":>7s}  corrupt edge columns')
    for st, g in stages.items():
        if not g['base']:
            continue
        join, med, ratio = seam_score(g['base'])
        prof, p95 = column_profile(g['base'])
        l, r = corrupt_columns(prof, p95)
        flag = ''
        if l or r:
            flag = f'L{l} R{r}   (p95 step {p95:.2f}, threshold {max(STEP_FLOOR, STEP_RATIO * p95):.1f})'
        print(f'{g["base"].stem:22s} {len(prof):5d} {join:7.1f} {med:12.2f} {ratio:7.1f}  {flag}')
    print()
    print('cards with corrupt edge columns:')
    n = 0
    for st, g in stages.items():
        for c in g['cards']:
            prof, p95 = column_profile(c)
            l, r = corrupt_columns(prof, p95)
            if l or r:
                print(f'  {c.stem:34s} L{l} R{r}   (p95 step {p95:.2f})')
                n += 1
    print(f'  {n} of {sum(len(g["cards"]) for g in stages.values())} cards')


def do_repair(dry_run):
    stages = shipped_files()
    total = 0
    for st, g in stages.items():
        targets = ([g['base']] if g['base'] else []) + g['cards']
        for path in targets:
            prof, p95 = column_profile(path)
            l, r = corrupt_columns(prof, p95)
            if not (l or r):
                continue
            before = seam_score(path)[2] if path.name.endswith('-base.webp') else None
            repair(path, l, r, dry_run)
            after = (seam_score(path)[2] if (before is not None and not dry_run) else None)
            tail = f'   seam ratio {before:.1f} -> {after:.1f}' if after is not None else ''
            print(f'{"(dry) " if dry_run else ""}{path.stem:34s} clamped L{l} R{r}{tail}')
            total += 1
    print(f'{total} file(s) {"would be " if dry_run else ""}repaired')


# ── self-test ─────────────────────────────────────────────────────────────
def selftest():
    """Three checks, none of which depend on any artwork."""
    ok = True
    tmp = Path('/tmp/_seam_selftest.webp')
    rng = np.random.default_rng(11)
    h, n = 120, 400
    x = np.arange(n)[None, :]
    y = np.arange(h)[:, None]
    clean = np.clip(90 + 30 * np.sin(x / 13.0) + 20 * np.sin(y / 5.0)
                    + rng.normal(0, 3, (h, n)), 0, 255)

    def rt(arr):
        Image.fromarray(arr.astype(np.uint8)).convert('RGB').save(tmp, 'WEBP', lossless=True)
        prof, p95 = column_profile(tmp)
        return corrupt_columns(prof, p95)

    # 1. A clean plate must be left alone. This is the check that matters —
    #    a repair pass that "fixes" good art is worse than the artifact.
    l, r = rt(clean)
    print(f'  1. clean plate       detects L{l} R{r}          {"PASS" if (l, r) == (0, 0) else "FAIL"}')
    ok &= (l, r) == (0, 0)

    # 2. A white border column, the l5p failure, must be caught and clamped.
    bad = clean.copy()
    bad[:, 0] = 252.0
    bad[:, 1] = 143.0
    l, r = rt(bad)
    hit = (l == 2 and r == 0)
    print(f'  2. white border x2   detects L{l} R{r}          {"PASS" if hit else "FAIL"}')
    ok &= hit
    if hit:
        Image.fromarray(bad.astype(np.uint8)).convert('RGB').save(tmp, 'WEBP', lossless=True)
        repair(tmp, l, r)
        a = np.asarray(Image.open(tmp).convert('RGB'), dtype=np.float64).mean(axis=(0, 2))
        near = abs(a[0] - a[2]) < 3 and abs(a[1] - a[2]) < 3
        print(f'     after clamp       cols 0,1,2 = {a[0]:.0f},{a[1]:.0f},{a[2]:.0f}    '
              f'{"PASS" if near else "FAIL"}')
        ok &= near

    # 3. A genuine bright feature that happens to touch the border — a lit
    #    pole at the frame edge — is content, not an artifact, and must
    #    survive. It is wide, so the step into it is nowhere near the
    #    threshold.
    feat = clean.copy()
    feat[:, :14] = 230.0
    l, r = rt(feat)
    print(f'  3. real edge feature detects L{l} R{r}          {"PASS" if (l, r) == (0, 0) else "FAIL"}')
    ok &= (l, r) == (0, 0)

    tmp.unlink(missing_ok=True)
    return ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--measure', action='store_true')
    ap.add_argument('--repair', action='store_true')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--selftest', action='store_true')
    args = ap.parse_args()

    if args.selftest:
        sys.exit(0 if selftest() else 1)
    if args.measure:
        do_measure()
        return
    if args.repair:
        do_repair(args.dry_run)
        return
    ap.error('give --measure, --repair or --selftest')


if __name__ == '__main__':
    main()
