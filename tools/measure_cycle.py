#!/usr/bin/env python3
"""
Find the true period of an animation clip by autocorrelation.

THE PROBLEM THIS SOLVES, because it is not the one people expect.

A generated spritesheet clip does not contain one cycle. AutoSprite's 96-frame
"walk" holds about five and a half strides; its "idle" holds three breaths; its
"jump" holds seven separate hops. Play the whole clip as a loop and you play
every one of those cycles per loop — which is how this project shipped, in
order, an idle breathing 168 times a minute, a walk running 4.2 strides a
second that read as running on the spot, and a jump that flailed between
grounded and airborne poses.

No amount of slowing the playback fixes it. The frames themselves span the
wrong distance, so slowing it down gives you five slow strides instead of five
fast ones. You have to take ONE cycle and then time THAT.

HOW IT MEASURES. Each frame becomes a small feature vector — a downsampled,
mean-removed grayscale of its alpha-masked pixels. For every candidate lag the
mean cosine similarity between frame i and frame i+lag is computed across the
clip. A cyclic animation peaks at its period and again at every multiple; the
lowest strong peak is the period.

WHY THE FEATURES ARE MASKED AND MEAN-REMOVED. A sprite cell is mostly empty,
and empty matches empty perfectly — leave the transparent surround in and every
lag scores ~0.99 and the peak disappears into the noise. Removing the mean kills
the constant background the same way.

WHY IT IGNORES VERY SHORT LAGS. Consecutive frames of anything are similar, so
similarity is monotonically high near lag 1 and that is not a cycle, it is just
continuity. MIN_LAG cuts it off below anything that could be a real gait.

USAGE

    # a composed atlas — checks each clip IS one clean cycle
    python3 tools/measure_cycle.py src/assets/sprites/will-hill.webp

    # a raw generated sheet, uniform grid, no atlas
    python3 tools/measure_cycle.py raw.png --grid 10x96

    # timing: how many ticks per frame for a real-world cadence
    python3 tools/measure_cycle.py raw.png --grid 10x96 --cadence "(whole sheet)"=0.55

    # prove the measurement still works after touching it
    python3 tools/measure_cycle.py --selftest

POINT IT AT RAW SHEETS. Run against an already-composed atlas every clip comes
back "nothing repeats", and that is the right answer rather than a failure:
autocorrelation needs two repeats to see a period, so a clip cut to exactly one
cycle has none left to find. That makes it a useful REGRESSION check on a
composed atlas — anything that still reports a period in there was cut wrong —
but the measurement itself belongs on the raw generated sheet.
"""
import argparse
import json
import os
import sys

import numpy as np
from PIL import Image

MIN_LAG = 4        # below this it is frame-to-frame continuity, not a cycle
FEAT = 24          # feature grid, per side
TICK_MS = 16.6     # one fixed physics step; see src/core/loop.js


def features(frames):
    """One mean-removed, alpha-masked vector per frame."""
    out = []
    for fr in frames:
        a = np.asarray(fr.convert('RGBA').resize((FEAT, FEAT), Image.BOX)).astype(float)
        g = (a[..., :3] * [0.30, 0.59, 0.11]).sum(2) * (a[..., 3] / 255.0)
        v = g.ravel()
        v -= v.mean()
        n = np.linalg.norm(v)
        out.append(v / n if n > 1e-6 else v)
    return np.array(out)


def period_of(frames, min_lag=MIN_LAG):
    """(period, confidence, score curve).

    THE PEAK HAS TO BE A REAL PEAK. The first version took the argmax over
    lags >= MIN_LAG and reported how far it stood above the median — which
    sounds like a confidence and is not one. Similarity decays monotonically
    with lag for any clip that ISN'T cyclic, so the argmax lands on MIN_LAG
    every time and the "confidence" comes back 1.00 because the maximum is
    trivially the maximum. Run against this project's own atlas it declared
    that a one-shot `hit` and a lying-down `knockdown` both had clean 4-frame
    cycles, which is nonsense.

    A cycle is a LOCAL MAXIMUM that stands above the dip on either side of it.
    Prominence — peak minus the higher of the two flanking troughs — is what
    separates that from a slope. No prominent local max means no cycle, which
    is the correct answer for a one-shot clip and something the old version
    could not say.
    """
    F = features(frames)
    n = len(F)
    if n < min_lag * 2 + 2:
        return None, 0.0, []
    scores = np.array([float(np.mean(np.sum(F[:-lag] * F[lag:], axis=1)))
                       for lag in range(1, n // 2 + 1)])

    peaks = []
    for i in range(min_lag - 1, len(scores) - 1):
        if scores[i] <= scores[i - 1] or scores[i] <= scores[i + 1]:
            continue
        # Walk out to the troughs either side; prominence is the peak above
        # the SHALLOWER descent, which is the standard definition and the one
        # that refuses to be impressed by a bump on a slope.
        li = i
        while li > 0 and scores[li - 1] <= scores[li]:
            li -= 1
        ri = i
        while ri < len(scores) - 1 and scores[ri + 1] <= scores[ri]:
            ri += 1
        prom = scores[i] - max(scores[li], scores[ri])
        peaks.append((i + 1, float(prom)))
    if not peaks:
        return None, 0.0, scores.tolist()

    span = float(scores.max() - scores.min()) or 1e-9
    strongest = max(p[1] for p in peaks)
    # The fundamental, not a harmonic: a period P peaks at P, 2P, 3P..., so
    # take the LOWEST lag whose prominence is most of the strongest one's.
    for lag, prom in peaks:
        if prom >= 0.6 * strongest:
            return lag, prom / span, scores.tolist()
    return peaks[0][0], peaks[0][1] / span, scores.tolist()


def cut_frames(sheet, cols, cw, ch, start, count):
    fr = []
    for k in range(count):
        i = start + k
        x, y = (i % cols) * cw, (i // cols) * ch
        fr.append(sheet.crop((x, y, x + cw, y + ch)))
    return fr


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('sheet', nargs='?')
    ap.add_argument('--grid', help='COLSxFRAMES for a raw sheet with no atlas')
    ap.add_argument('--cadence', action='append', default=[],
                    help='clip=SECONDS — real-world duration for ONE cycle, '
                         'e.g. walk=0.55 for a 1.1s two-step stride')
    ap.add_argument('--selftest', action='store_true',
                    help='check the measurement against synthetic clips of '
                         'known period. Run this after touching period_of.')
    a = ap.parse_args()

    if a.selftest:
        sys.exit(selftest())
    if not a.sheet:
        ap.error('give a sheet, or --selftest')

    sheet = Image.open(a.sheet).convert('RGBA')
    atlas_path = os.path.splitext(a.sheet)[0] + '.atlas.json'

    cadence = {}
    for c in a.cadence:
        k, _, v = c.partition('=')
        cadence[k] = float(v)

    if a.grid:
        cols, total = (int(x) for x in a.grid.lower().split('x'))
        cw, ch = sheet.width // cols, sheet.height // ((total + cols - 1) // cols)
        clips = {'(whole sheet)': (0, total, True)}
    elif os.path.exists(atlas_path):
        at = json.load(open(atlas_path))
        cw, ch = at['frameSize']
        cols = sheet.width // cw
        clips = {}
        for name, an in at['animations'].items():
            start = an['start'] if 'start' in an else an['row'] * cols
            clips[name] = (start, an['frameCount'], bool(an.get('loop')))
    else:
        sys.exit('no atlas beside the sheet; pass --grid COLSxFRAMES')

    print(f'{os.path.basename(a.sheet)}  cell {cw}x{ch}, {cols} per row\n')
    print(f'{"clip":12s} {"frames":>6s} {"period":>7s} {"conf":>5s}   verdict')
    seen = set()
    for name, (start, count, loops) in clips.items():
        if (start, count) in seen:
            print(f'{name:12s} {count:6d} {"":>7s} {"":>5s}   (same frames as an earlier clip)')
            continue
        seen.add((start, count))
        frames = cut_frames(sheet, cols, cw, ch, start, count)
        p, conf, _ = period_of(frames)
        # NOTHING REPEATING IS THE PASS CONDITION FOR A COMPOSED CLIP, and
        # that is arithmetic rather than a limitation: autocorrelation needs
        # two repeats to see a period, so a clip already cut to exactly one
        # cycle has none left to find. Which of the two "no cycle" answers it
        # is depends on whether the clip is meant to loop, and the atlas knows.
        # 0.20, not 0.08. The self test shows a genuine cycle scoring 1.00
        # and a true one-shot scoring 0.00, so the gap is enormous and the
        # threshold should sit well clear of the noise floor rather than just
        # above it — at 0.08 the one-shot `knockback` squeaked through at 0.09
        # and was reported as holding 3.2 cycles.
        if p is None or conf < 0.20:
            verdict = ('already ONE CYCLE — nothing repeats, correct' if loops
                       else 'one-shot clip — no cycle expected, correct')
            print(f'{name:12s} {count:6d} {"-":>7s} {conf:5.2f}   {verdict}')
            continue
        cycles = count / p
        verdict = (f'holds ~{cycles:.1f} cycles — CUT IT to {p} frames'
                   if cycles >= 1.35 else 'ONE CYCLE — good')
        print(f'{name:12s} {count:6d} {p:7d} {conf:5.2f}   {verdict}')

        if name in cadence:
            secs = cadence[name]
            ticks = secs * 1000 / TICK_MS / p
            print(f'{"":12s}        -> {secs}s per cycle over {p} frames '
                  f'= {ticks:.2f} ticks/frame')




# ── SELF TEST ────────────────────────────────────────────────────────────
# Run with --selftest. A measurement tool nobody has checked against a KNOWN
# answer is just an opinion with decimal places, and the first version of
# period_of passed every eyeball test while being completely wrong.
def selftest():
    import math
    ok = True

    def synth(period, reps, noise=0.0, rng=np.random.default_rng(7)):
        frames = []
        for i in range(period * reps):
            ph = 2 * math.pi * (i % period) / period
            g = np.zeros((40, 40), float)
            # a blob that orbits — same pose returns exactly every `period`
            cx = 20 + 12 * math.cos(ph)
            cy = 20 + 12 * math.sin(ph)
            yy, xx = np.mgrid[0:40, 0:40]
            g = np.exp(-(((xx - cx) ** 2 + (yy - cy) ** 2) / 30.0)) * 255
            if noise:
                g = np.clip(g + rng.normal(0, noise, g.shape), 0, 255)
            rgba = np.dstack([g, g, g, np.full_like(g, 255)]).astype(np.uint8)
            frames.append(Image.fromarray(rgba, 'RGBA'))
        return frames

    for period, reps in ((8, 4), (12, 3), (17, 3), (6, 6)):
        got, conf, _ = period_of(synth(period, reps))
        good = got == period
        ok &= good
        print(f'  {"PASS" if good else "FAIL"}  {reps} reps of a {period}-frame '
              f'cycle -> measured {got} (conf {conf:.2f})')

    got, conf, _ = period_of(synth(11, 3, noise=28))
    good = got == 11
    ok &= good
    print(f'  {"PASS" if good else "FAIL"}  noisy 11-frame cycle -> {got} (conf {conf:.2f})')

    # A one-shot: a blob travelling in a straight line, never repeating.
    frames = []
    for i in range(24):
        yy, xx = np.mgrid[0:40, 0:40]
        g = np.exp(-(((xx - (4 + i * 1.3)) ** 2 + (yy - 20) ** 2) / 30.0)) * 255
        frames.append(Image.fromarray(
            np.dstack([g, g, g, np.full_like(g, 255)]).astype(np.uint8), 'RGBA'))
    got, conf, _ = period_of(frames)
    good = got is None or conf < 0.20
    ok &= good
    print(f'  {"PASS" if good else "FAIL"}  one-shot (no cycle) -> '
          f'{got} (conf {conf:.2f}) — should be no clear cycle')
    print('\nself test:', 'ALL PASS' if ok else 'FAILURES ABOVE')
    return 0 if ok else 1


if __name__ == '__main__':
    main()
