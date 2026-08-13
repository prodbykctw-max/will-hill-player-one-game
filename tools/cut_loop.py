#!/usr/bin/env python3
"""Cut a game-length loop out of a full track, starting at its hook.

WHY NOT JUST SHIP THE SONG. Two reasons, and the second is the real one.

Size: the nine tracks the cue sheet uses are 30.4MB as delivered. They stream
rather than preload, so nobody downloads all of it, but stage one alone would
be 3.7MB before a note plays, over whatever cell signal is in the room.

And the loop. `MANIFEST[slot].startAt` skips a track's intro so the cue opens
on its hook — but a media element with `loop = true` wraps to ZERO, not to
startAt. First pass starts at the hook; every pass after that plays the intro
the offset existed to avoid. Cutting the file so the hook IS the start makes
startAt 0, the native loop correct, and the wrap gapless.

── FINDING THE LOOP POINT ────────────────────────────────────────────────
Not by tempo. A cut at a whole number of bars needs the bar length, and beat
trackers lock to whatever pulse is strongest: this project's read 89 BPM on a
track whose own filename says 135, which is exactly two thirds of it. Snapping
to a bar length that is 3/2 of the truth would put the splice off the beat
every time.

So measure the thing we actually want instead. Search candidate lengths around
the target and score each by how well the audio LEADING INTO the loop point
matches the audio the loop RETURNS TO — normalised cross-correlation over a
short window, on mono. The winner is the length whose end genuinely continues
into its own start, whatever the tempo is. Same method as the plate seam work
in tools/fix_seam.py, one dimension instead of two.

A 15ms equal-power crossfade is wrapped around the splice afterwards. That is
short enough to be inaudible as a fade and long enough to kill the click a
sample-level discontinuity makes.

Usage:
    python3 tools/cut_loop.py --plan            # what it would cut, no writes
    python3 tools/cut_loop.py --write           # cut into src/assets/music/
    python3 tools/cut_loop.py --selftest
"""

import argparse
import json
import os
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'src' / 'assets' / 'music'

# Delivery bitrate. libsndfile's VARIABLE mode, where 0.0 is largest and 1.0
# is smallest; 0.5 measured at ~121kbps against a 192kbps source. Instrumental
# beds under sound effects on a phone speaker do not need more, and the
# masters are untouched.
COMPRESSION = 0.5

# How much audio each slot needs before it wraps. Stage floors are measured
# (40/43/47/50s at 4.80 px/tick) and real play runs longer, so stages get half
# again on top. The MARTA screens are 2.5s exactly and could take almost
# nothing, but a cue that short would wrap audibly if the ride is ever
# lengthened. Title and pause are open-ended, so they get the longest loop the
# track can give without running past its own end.
TARGET = {
    'title': 60.0,
    'stage_01': 60.0, 'stage_02': 65.0, 'stage_03': 70.0, 'stage_04': 75.0,
    'map_01_02': 24.0, 'map_02_03': 24.0, 'map_03_04': 24.0,
    'ui_pause': 45.0,
    'credits': None,       # plays once; take everything from the hook onward
}

SEARCH = 0.25      # look this far either side of the target, as a fraction
MATCH_WIN = 1.5    # seconds of audio compared across the splice
XFADE = 0.015      # equal-power crossfade over the join


def ncc(a, b):
    """Normalised cross-correlation of two equal-length signals, -1..1."""
    a = a - a.mean()
    b = b - b.mean()
    d = np.sqrt((a * a).sum() * (b * b).sum())
    return float((a * b).sum() / d) if d > 1e-12 else 0.0


def best_length(mono, sr, target):
    """Pick the loop length near `target` whose end continues into its start.

    THE COMPARISON IS HEAD AGAINST WHAT FOLLOWS THE CUT, and getting that
    backwards is the trap. Playing mono[0:n] on loop puts mono[n-1] next to
    mono[0]; in the original, mono[n-1] is followed by mono[n]. So the wrap is
    seamless exactly when mono[0:win] matches mono[n:n+win].

    The first version of this compared the window ENDING at the cut against
    the head instead, which is satisfied when n is a whole period plus `win` —
    off by the arbitrary width of the comparison window every time. The
    selftest caught it: on a signal with a known 4.0s period it confidently
    picked 9.5s, scored it 1.000, and 9.5 is 8.0 + the 1.5s window.
    """
    win = int(MATCH_WIN * sr)
    lo = int(target * (1 - SEARCH) * sr)
    hi = int(min(target * (1 + SEARCH) * sr, len(mono) - win))
    if hi <= lo:
        return len(mono), 0.0, []
    step = max(1, int(0.002 * sr))       # 2ms resolution is finer than the ear
    head = mono[:win]
    scored = []
    for n in range(lo, hi, step):
        scored.append((ncc(head, mono[n:n + win]), n))
    scored.sort(reverse=True)
    best_score, best_n = scored[0]
    return best_n, best_score, scored[:5]


def splice_score(y, sr):
    """The step ACROSS the wrap, in units of the track's own typical
    sample-to-sample step. This is the click, measured: looping puts the last
    sample next to the first, so that one jump is the whole question. Around
    1x means the two samples are as close together as any neighbouring pair in
    the track, i.e. there is nothing to hear."""
    a = y[0] if y.ndim == 1 else y[0, :]
    b = y[-1] if y.ndim == 1 else y[-1, :]
    join = float(np.abs(np.atleast_1d(a) - np.atleast_1d(b)).mean())
    ch = y if y.ndim == 1 else y[:, 0]
    typical = float(np.median(np.abs(np.diff(ch))))
    return join, typical, join / max(typical, 1e-9)


def crossfade_wrap(y, n, sr):
    """Make y[0:n] loop by blending WHAT WOULD HAVE PLAYED NEXT over its head.

    THE EXTRA AUDIO COMES FROM AFTER THE CUT, not from the head itself. Fading
    the head into the head — the first version of this — leaves the clip
    ending on a sample 15ms deep into its own start, so the wrap lands on two
    samples that were never adjacent and the join got *worse*: measured 13x
    the typical step before, 189x after.

    Done right: the clip still ends on y[n-1], and its first sample has been
    replaced by y[n], which is what genuinely followed. The wrap is then an
    ordinary neighbouring pair.
    """
    k = int(XFADE * sr)
    if k < 8 or n < 4 * k or y.shape[0] < n + k:
        return y[:n]
    clip = y[:n].copy()
    nxt = y[n:n + k]
    t = np.linspace(0, 1, k)[:, None] if clip.ndim > 1 else np.linspace(0, 1, k)
    clip[:k] = nxt * np.cos(t * np.pi / 2) + clip[:k] * np.sin(t * np.pi / 2)
    return clip


def cut(src, hook, target, dest, dry_run=False):
    import librosa
    import soundfile as sf
    y, sr = librosa.load(str(src), sr=None, mono=False)
    if y.ndim == 1:
        y = np.stack([y, y])
    y = y.T                                     # frames x channels
    a = int(hook * sr)
    rest = y[a:]
    mono = rest.mean(axis=1)

    if target is None:
        n, score = len(rest), None              # credits: no loop, keep it all
        clip = rest
        before = after = splice_score(clip, sr)
    else:
        n, score, _ = best_length(mono, sr, min(target, len(rest) / sr))
        before = splice_score(rest[:n], sr)
        clip = crossfade_wrap(rest, n, sr)      # takes the FULL rest, not the clip
        after = splice_score(clip, sr)

    info = {
        'src': src.name, 'hook': hook, 'secs': round(len(clip) / sr, 2),
        'match': None if score is None else round(score, 3),
        'join_before': round(before[2], 1), 'join_after': round(after[2], 1),
    }
    if not dry_run:
        dest.parent.mkdir(parents=True, exist_ok=True)
        sf.write(str(dest), clip, sr, format='MP3',
                 bitrate_mode='VARIABLE', compression_level=COMPRESSION)
        info['bytes'] = os.path.getsize(dest)
        info['kbps'] = round(os.path.getsize(dest) * 8 / (len(clip) / sr) / 1000)
    return info


def selftest():
    """Three checks against synthetic audio, no music involved."""
    import soundfile as sf
    ok = True
    sr = 22050
    t = np.arange(int(20 * sr)) / sr

    # 1. A signal with an exact 4.0s period: the search must land on a whole
    #    number of periods, not on some arbitrary length in between.
    per = 4.0
    sig = (np.sin(2 * np.pi * 3 * t / per) + 0.5 * np.sin(2 * np.pi * 11 * t / per))
    n, score, _ = best_length(sig, sr, 8.3)
    got = n / sr
    near = min(abs(got - k * per) for k in (1, 2, 3, 4))
    print(f'  1. periodic signal   picked {got:.3f}s, {near * 1000:.0f}ms off a '
          f'whole period, match {score:.3f}    {"PASS" if near < 0.05 and score > 0.9 else "FAIL"}')
    ok &= near < 0.05 and score > 0.9

    # 2. Noise has no loop point. The best match must be poor, so a bad score
    #    is legible as "this will not loop" instead of passing silently.
    rng = np.random.default_rng(3)
    _, nscore, _ = best_length(rng.normal(0, 1, len(t)), sr, 8.3)
    print(f'  2. white noise       best match {nscore:.3f}                          '
          f'{"PASS" if nscore < 0.35 else "FAIL"}')
    ok &= nscore < 0.35

    # 3. The crossfade must shrink the step at the join, on the kind of cut
    #    this tool actually makes: a loop point that is nearly right and a few
    #    milliseconds off. An earlier version of this test cut a square wave
    #    at its own edge, where the head and what-follows are opposite — a
    #    point best_length would never pick — and then blamed the crossfade
    #    for the result.
    sig2 = np.repeat((sig + rng.normal(0, 0.01, len(sig)))[:, None], 2, axis=1)
    off = int(0.007 * sr)                    # 7ms past a whole period
    n3 = int(2 * per * sr) + off
    b = splice_score(sig2[:n3], sr)[2]
    a = splice_score(crossfade_wrap(sig2, n3, sr), sr)[2]
    print(f'  3. crossfade         join {b:.0f}x -> {a:.0f}x typical step            '
          f'{"PASS" if a < b / 4 else "FAIL"}')
    ok &= a < b / 4
    return ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--sheet', default=str(ROOT / 'tools' / 'cue_sheet.json'))
    ap.add_argument('--tracks', required=False)
    ap.add_argument('--plan', action='store_true')
    ap.add_argument('--write', action='store_true')
    # Re-cutting one slot rather than all ten. Every write is another lossy
    # encode, so a slot whose pairing did not change should not be touched.
    ap.add_argument('--only', action='append',
                    help='limit to these slots; repeatable')
    ap.add_argument('--selftest', action='store_true')
    args = ap.parse_args()

    if args.selftest:
        sys.exit(0 if selftest() else 1)

    sheet = json.load(open(args.sheet))
    src_dir = Path(args.tracks or sheet['tracks_dir'])
    dry = not args.write

    print(f'{"slot":12s} {"file":26s} {"hook":>7s} {"cut":>7s} {"match":>6s} '
          f'{"join":>12s} {"size":>9s}')
    done = {}
    total = 0
    for slot, e in sheet['cues'].items():
        if args.only and slot not in args.only:
            continue
        key = e['track']
        dest = OUT / f'{slot}.mp3'
        if key in done and TARGET.get(slot) == done[key]['target']:
            # Two slots on the same track and the same length: cut once.
            print(f'{slot:12s} {key + ".mp3":26s} '
                  f'{"same as " + done[key]["slot"]:>44s}')
            continue
        info = cut(src_dir / f'{key}.mp3', e['hook'], TARGET.get(slot), dest, dry)
        done[key] = {'slot': slot, 'target': TARGET.get(slot)}
        size = f'{info["bytes"] / 1024 / 1024:.2f}MB' if 'bytes' in info else '-'
        total += info.get('bytes', 0)
        m = '-' if info['match'] is None else f'{info["match"]:.2f}'
        print(f'{slot:12s} {key + ".mp3":26s} {info["hook"]:7.1f} {info["secs"]:7.1f} '
              f'{m:>6s} {info["join_before"]:5.0f}x ->{info["join_after"]:4.0f}x '
              f'{size:>9s}')
    if total:
        print(f'\ntotal shipped audio: {total / 1024 / 1024:.2f} MB')


if __name__ == '__main__':
    main()
