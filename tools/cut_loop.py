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
# +20s on every loop, at the client's call: "the music time is slightly off on
# the loop... just extend them both, all the loops 20 seconds longer. I'll work
# on cutting them properly later." Longer loops mean the wrap comes round less
# often, which is the cheapest way to make a not-quite-right loop point matter
# less while he decides where he actually wants the cuts.
EXTEND = 20.0
TARGET = {
    'title': 60.0 + EXTEND,
    'stage_01': 60.0 + EXTEND, 'stage_02': 65.0 + EXTEND,
    'stage_03': 70.0 + EXTEND, 'stage_04': 75.0 + EXTEND,
    'map_01_02': 24.0 + EXTEND, 'map_02_03': 24.0 + EXTEND, 'map_03_04': 24.0 + EXTEND,
    'ui_pause': 45.0 + EXTEND,
    'credits': None,       # plays once; take everything from the hook onward
}

# THE SEARCH ONLY LOOKS LONGER, NEVER SHORTER. It used to run +/-25% around the
# target, which meant "make the loops 20s longer" could come back with a cut
# SHORTER than before if the correlation happened to peak there — asked for 80s
# on the title and got 68.1s, the same length as the run before. A one-sided
# range makes the target a floor and still leaves room to find a good join.
SEARCH_UP = 0.45   # how much longer than the target the search may go
MATCH_WIN = 1.5    # seconds of audio compared across the splice
XFADE = 0.015      # equal-power crossfade over the join

# ── LEVELLING ────────────────────────────────────────────────────────────
# The client: "we need levelling across all of the tracks... there's clearly a
# difference." He is right and it is large — the sources run -10.4 to -19.5
# dBFS RMS, a 9dB spread, so one cue arrives twice as loud as the next.
#
# Matched on LUFS (ITU-R BS.1770-4), not RMS. RMS counts a sub-bass rumble and
# a snare as equally loud; K-weighting is the standard's answer to that, and it
# is what every streaming service levels to. pyloudnorm is not installed here,
# so the filters and the gating below are the spec implemented directly.
TARGET_LUFS = -16.0    # a normal bed level; these sit under SFX at gain 0.5
PEAK_CEILING = -1.0    # dBFS. A quiet track is raised only as far as this.


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
    lo = int(target * sr)
    hi = int(min(target * (1 + SEARCH_UP) * sr, len(mono) - win))
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


# ── THE PRODUCER KNOWS THE TEMPO; A BEAT TRACKER ONLY GUESSES IT ─────────
#
# The header explains why this file does not snap to bars: a tracker read 89
# BPM on a track whose own filename says 135, two thirds of the truth, and a
# bar length that is 3/2 wrong puts the splice off the beat every time. That
# reasoning is still correct — for a MACHINE. It stops applying the moment the
# person who produced the track tells you the number.
#
# So these are his, given per source track, and they unlock the cut the
# correlation search can only approximate: a loop whose length is a whole
# number of bars returns to its own downbeat, which is seamless by
# construction rather than by search.
#
#   lonliness_2 (stage_04) 174 — his count. Autocorrelation agrees but peaks
#     hardest at 2.759s, a bar at 87: 174 is the double-time count of the same
#     grid. Harmless as long as the bar count is EVEN, which keeps the cut on
#     a downbeat under either reading. Verified: beat 0.702, bar 0.696.
#   doggzzz (ui_pause) 145 — verified beat 0.840, bar 0.755, both strong.
#
# Add a track here as he supplies it; without an entry the old correlation
# search runs unchanged, so this is additive and nothing else moves.
BPM = {
    'lonliness_2': 174.0,
    'doggzzz': 145.0,
}
# Phrases are counted in fours and eights in this music, so candidates step in
# 4 bars and an 8-bar multiple gets a small thumb on the scale — enough to win
# a tie against a mid-phrase length, never enough to beat a genuinely better
# join. The join still decides.
BAR_STEP = 4
PHRASE_BONUS = 0.02


def best_length_bars(mono, sr, bpm, target):
    """Pick a BAR-EXACT loop length, scored by the same join test.

    The correlation search alone can land anywhere, including a few
    milliseconds off the beat — inaudible as a click after the crossfade, but
    the music arrives late on the downbeat every single wrap, which is the
    error you hear as "the loop is slightly off" even when there is no click.
    Restricting the candidates to whole bars removes that failure entirely;
    scoring them by ncc keeps the tool's own answer to "does this end actually
    continue into this start", so the bar grid narrows the field and the audio
    still picks the winner.
    """
    win = int(MATCH_WIN * sr)
    bar = 4.0 * 60.0 / bpm
    lo_bars = max(BAR_STEP, int(np.floor(target / bar)))
    hi_bars = int((len(mono) - win) / sr / bar)
    head = mono[:win]
    scored = []
    for bars in range(lo_bars, hi_bars + 1):
        if bars % BAR_STEP:
            continue
        n = int(round(bars * bar * sr))
        if n + win > len(mono):
            break
        s = ncc(head, mono[n:n + win])
        if bars % 8 == 0:
            s += PHRASE_BONUS
        scored.append((s, n, bars))
    if not scored:
        return best_length(mono, sr, target)
    scored.sort(reverse=True)
    best_score, best_n, best_bars = scored[0]
    return best_n, best_score, [(s, n) for s, n, _ in scored[:5]], best_bars


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


def k_weight(x, sr):
    """ITU-R BS.1770-4 K-weighting: a high shelf then a high-pass.

    The published coefficients are defined at 48kHz, so anything else is
    resampled for the MEASUREMENT only — the audio that gets written is never
    touched by this.
    """
    from scipy.signal import lfilter, resample_poly
    if sr != 48000:
        from math import gcd
        g = gcd(int(sr), 48000)
        x = resample_poly(x, 48000 // g, int(sr) // g, axis=0)
    b1 = [1.53512485958697, -2.69169618940638, 1.19839281085285]
    a1 = [1.0, -1.69065929318241, 0.73248077421585]
    b2 = [1.0, -2.0, 1.0]
    a2 = [1.0, -1.99004745483398, 0.99007225036621]
    return lfilter(b2, a2, lfilter(b1, a1, x, axis=0), axis=0)


def lufs(y, sr):
    """Integrated loudness, BS.1770-4, with both gates.

    400ms blocks at 75% overlap; an absolute gate at -70 LUFS throws away
    silence, then a relative gate 10 LU below the ungated mean throws away the
    quiet passages, so an intro does not drag the number down.
    """
    x = y if y.ndim > 1 else y[:, None]
    k = k_weight(x, sr)
    fs = 48000
    block, hop = int(0.4 * fs), int(0.1 * fs)
    if k.shape[0] < block:
        return -70.0
    n = 1 + (k.shape[0] - block) // hop
    # Channel weights are 1.0 for L and R; this game has no surround.
    ms = np.empty(n)
    for i in range(n):
        seg = k[i * hop:i * hop + block]
        ms[i] = (seg ** 2).mean(axis=0).sum()
    with np.errstate(divide='ignore'):
        l = -0.691 + 10 * np.log10(np.maximum(ms, 1e-20))
    keep = l > -70.0
    if not keep.any():
        return -70.0
    gamma = -0.691 + 10 * np.log10(ms[keep].mean()) - 10.0
    keep &= l > gamma
    if not keep.any():
        return -70.0
    return float(-0.691 + 10 * np.log10(ms[keep].mean()))


def level_to(y, sr, target_lufs=TARGET_LUFS, ceiling_db=PEAK_CEILING):
    """Bring a clip to the target loudness, never letting it clip.

    Raising a quiet track to match a loud one can only go as far as its own
    headroom: pushing the quietest source here up to the loudest would put its
    peak 7dB past full scale. So the gain is clamped by the peak ceiling and
    the ACHIEVED loudness is reported rather than assumed — a file that could
    not make the target lands quieter, and says so, instead of arriving
    silently distorted.
    """
    cur = lufs(y, sr)
    want = 10 ** ((target_lufs - cur) / 20.0)
    peak = float(np.abs(y).max())
    room = (10 ** (ceiling_db / 20.0)) / max(peak, 1e-9)
    gain = min(want, room)
    out = y * gain
    return out, cur, lufs(out, sr), 20 * np.log10(max(gain, 1e-9)), gain < want * 0.999


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

    bars = None
    if target is None:
        n, score = len(rest), None              # credits: no loop, keep it all
        clip = rest
        before = after = splice_score(clip, sr)
    else:
        bpm = BPM.get(src.stem)
        want = min(target, len(rest) / sr)
        if bpm:
            n, score, _, bars = best_length_bars(mono, sr, bpm, want)
        else:
            n, score, _ = best_length(mono, sr, want)
        before = splice_score(rest[:n], sr)
        clip = crossfade_wrap(rest, n, sr)      # takes the FULL rest, not the clip
        after = splice_score(clip, sr)

    # Levelled AFTER the cut, so the number describes the audio that ships:
    # measuring the whole track would be dragged around by an intro nobody
    # hears, and the loop point is chosen on the untouched signal.
    clip, was, now, gain_db, capped = level_to(clip, sr)

    info = {
        'src': src.name, 'hook': hook, 'secs': round(len(clip) / sr, 2),
        'bars': bars, 'bpm': BPM.get(src.stem),
        'match': None if score is None else round(score, 3),
        'join_before': round(before[2], 1), 'join_after': round(after[2], 1),
        'lufs_before': round(was, 1), 'lufs_after': round(now, 1),
        'gain_db': round(gain_db, 1), 'capped': capped,
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

    print(f'{"slot":12s} {"file":24s} {"cut":>6s} {"match":>6s} {"join":>11s} '
          f'{"LUFS":>15s} {"gain":>7s} {"size":>8s}')
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
        print(f'{slot:12s} {key + ".mp3":24s} {info["secs"]:6.1f} '
              f'{m:>6s} {info["join_before"]:4.0f}x ->{info["join_after"]:3.0f}x '
              f'{info["lufs_before"]:7.1f} ->{info["lufs_after"]:6.1f} '
              f'{info["gain_db"]:+6.1f}{"!" if info["capped"] else " "} {size:>8s}')
    if total:
        print(f'\ntotal shipped audio: {total / 1024 / 1024:.2f} MB')


if __name__ == '__main__':
    main()
