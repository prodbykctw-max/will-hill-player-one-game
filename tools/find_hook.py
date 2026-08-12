#!/usr/bin/env python3
"""
Find the part of a song to start a game cue on — without listening to it.

THE PROBLEM. A stage lasts 30-45 seconds against songs of 3-4 minutes, so a
cue that starts at 0:00 plays the intro and gets cut before the song does
anything. Every slot in src/audio/music.js therefore has a `startAt`, and
somebody has to decide ten of them.

The client's actual complaint is worth quoting because it defines the job:
"the previews were giving me parts of the song that were pretty much exactly
what I needed, so I don't know how to go through and find all of that without
listening to every song, which I'm really not trying to do." He does not want
a tool that helps him audition. He wants the timestamps.

TWO WAYS TO GET THEM, and the second is better whenever it is available.

── --hook ────────────────────────────────────────────────────────────────
Audio thumbnailing. The chorus of a pop record is the section that (a) repeats
more than anything else and (b) is louder and denser than what surrounds it,
so both are measured and combined.

REPETITION is measured on CHROMA, not on the waveform or the spectrum. Chroma
folds every octave onto twelve pitch classes, so it describes the harmony and
ignores timbre — which is what lets it recognise the second chorus as the same
thing as the first even though the ad-libs, the doubles and the mix are all
different. A self-similarity matrix over chroma lights up on exactly those
repeats. Raw spectral features do not: they score "loud and busy" as similar
to "loud and busy" and find the wrong thing.

ENERGY is RMS, smoothed. On its own it picks the biggest drop, which is often
right and often a bridge or an outro; on its own repetition sometimes picks a
verse that happens to occur three times. Together they behave.

── --match PREVIEW ───────────────────────────────────────────────────────
If you can supply the 30 seconds you already liked — and A PHONE RECORDING OF
IT PLAYING IS ENOUGH — this finds where in the master it came from, to the
frame, and then no algorithm has to guess at taste. Matching is also done on
chroma, which is why a bad recording works: chroma survives phone speakers,
room noise, MP3 artefacts and EQ, because the harmony is unchanged. The report
includes a confidence, so a bad match says so instead of returning a number.

USAGE

    python3 tools/find_hook.py song.mp3                      # one file
    python3 tools/find_hook.py src/assets/music/ --len 40    # a whole folder
    python3 tools/find_hook.py song.mp3 --match preview.m4a  # exact offset
    python3 tools/find_hook.py --selftest                    # prove it works

It prints a `startAt` per file in the shape music.js wants, so the output can
be pasted straight into the manifest.
"""
import argparse
import glob
import os
import sys

import numpy as np

SR = 22050
HOP = 512
FPS = SR / HOP          # feature frames per second


def load(path):
    import librosa
    y, _ = librosa.load(path, sr=SR, mono=True)
    return y


def chroma(y):
    """Harmony over time, timbre discarded. See the module note."""
    import librosa
    c = librosa.feature.chroma_cqt(y=y, sr=SR, hop_length=HOP)
    # Column-normalise so loud bars do not dominate the similarity.
    n = np.linalg.norm(c, axis=0, keepdims=True)
    return c / np.maximum(n, 1e-8)


def energy(y):
    import librosa
    r = librosa.feature.rms(y=y, hop_length=HOP)[0]
    # ~1.5s smoothing: a chorus is a section, not a transient.
    k = max(1, int(FPS * 1.5))
    return np.convolve(r, np.ones(k) / k, mode='same')


def find_hook(y, win_s):
    """(start_seconds, score, why) for the most chorus-like window."""
    C = chroma(y)
    E = energy(y)
    n = C.shape[1]
    w = int(win_s * FPS)
    if n <= w * 2:
        return 0.0, 0.0, 'track is barely longer than the window'

    # Coarse grid: the answer only needs to be good to about a second, and a
    # full self-similarity matrix at frame resolution is n^2.
    step = max(1, int(FPS * 0.5))
    starts = list(range(0, n - w, step))

    # Downsample each candidate window to a fixed-length signature so windows
    # can be compared to each other cheaply.
    SIG = 32
    sigs = []
    for s in starts:
        blk = C[:, s:s + w]
        idx = np.linspace(0, blk.shape[1] - 1, SIG).astype(int)
        v = blk[:, idx].reshape(-1)
        sigs.append(v / max(np.linalg.norm(v), 1e-8))
    S = np.array(sigs)
    sim = S @ S.T                      # every window against every other

    # REPETITION: how well does this window match its best matches ELSEWHERE?
    # "Elsewhere" means non-overlapping, or every window trivially matches
    # itself and its neighbours and the whole thing measures nothing.
    gap = max(1, w // step)
    rep = np.zeros(len(starts))
    for i in range(len(starts)):
        others = np.concatenate([sim[i, :max(0, i - gap)], sim[i, i + gap:]])
        if others.size:
            rep[i] = np.sort(others)[-3:].mean()   # its three best echoes

    eng = np.array([E[s:s + w].mean() for s in starts])
    norm = lambda a: (a - a.min()) / max(a.max() - a.min(), 1e-9)
    # Repetition weighted higher: a loud bridge is not a hook, but a section
    # that comes back three times is, even at moderate level.
    score = 0.62 * norm(rep) + 0.38 * norm(eng)

    # Never open on the very first seconds — that is the intro by definition,
    # and it is what starting at 0 already gives you.
    for i, s in enumerate(starts):
        if s / FPS < 8:
            score[i] *= 0.35

    best = int(np.argmax(score))
    why = f'repetition {norm(rep)[best]:.2f}, energy {norm(eng)[best]:.2f}'
    return starts[best] / FPS, float(score[best]), why


def find_offset(y, y_ref):
    """Where in `y` does the excerpt `y_ref` occur? (seconds, confidence)."""
    C = chroma(y)
    R = chroma(y_ref)
    n, m = C.shape[1], R.shape[1]
    if m >= n:
        return 0.0, 0.0
    rv = R.reshape(-1)
    rv = rv / max(np.linalg.norm(rv), 1e-8)
    step = max(1, int(FPS * 0.25))
    scores, offs = [], []
    for s in range(0, n - m, step):
        v = C[:, s:s + m].reshape(-1)
        scores.append(float(np.dot(v / max(np.linalg.norm(v), 1e-8), rv)))
        offs.append(s)
    scores = np.array(scores)
    i = int(np.argmax(scores))
    # ⚠️ CONFIDENCE IS THE PEAK'S RAW HEIGHT, AND PROMINENCE IS WRONG HERE.
    #
    # tools/measure_cycle.py was fixed by exactly the opposite change — its
    # first version took a raw maximum and had to learn that a bump on a slope
    # is not a peak. Carrying that lesson across to this tool broke it, and the
    # self test caught it: scored by prominence, a clip from a DIFFERENT SONG
    # beat the correct match, 3.1 sigma against 1.9.
    #
    # The reason is the shape of the two problems. There, the score curve
    # decays with lag, so height is meaningless and only standing above the
    # local dip counts. HERE the curve is flat, and a clip that matches
    # NOWHERE produces one lonely bump on that flat floor — which is a
    # towering prominence and a terrible match. Measured on the self test:
    #
    #     correct, badly degraded excerpt   peak 0.886   prominence 1.9 sigma
    #     clip from another song            peak 0.693   prominence 3.1 sigma
    #
    # Peak height separates them the right way round (1.28x); prominence
    # separates them backwards (0.61x). Chroma cosine over a 30s window is
    # already a normalised, comparable quantity — it does not need rescaling
    # by anything, and rescaling it is what threw the answer away.
    conf = float(scores[i])
    return offs[i] / FPS, conf


def mmss(t):
    return f'{int(t // 60)}:{t % 60:04.1f}'


def selftest():
    """Prove both modes against signals whose answer is known.

    A measurement tool nobody has checked against a KNOWN answer is an opinion
    with decimal places — the same rule tools/measure_cycle.py is written
    under, after its first version confidently reported cycles in a one-shot.
    """
    rng = np.random.default_rng(4)
    ok = True

    def tone(freqs, secs, amp=0.3):
        t = np.arange(int(secs * SR)) / SR
        out = np.zeros_like(t)
        for f in freqs:
            out += np.sin(2 * np.pi * f * t)
        return out / len(freqs) * amp

    # A fake song: intro, verse, CHORUS, verse, CHORUS, outro. The chorus has
    # its own chord set and is louder — so it should win on both counts.
    VERSE = [220.0, 277.2, 329.6]          # A minor-ish
    CHORUS = [261.6, 329.6, 392.0]         # C major-ish
    parts = [('intro', VERSE, 10, 0.15), ('verse', VERSE, 20, 0.25),
             ('chorus', CHORUS, 20, 0.45), ('verse', VERSE, 20, 0.25),
             ('chorus', CHORUS, 20, 0.45), ('outro', VERSE, 10, 0.12)]
    song, marks, t = [], {}, 0.0
    for name, ch, secs, amp in parts:
        if name == 'chorus' and 'chorus' not in marks:
            marks['chorus'] = t
        song.append(tone(ch, secs, amp))
        t += secs
    y = np.concatenate(song) + rng.normal(0, 0.002, int(t * SR))

    got, _, why = find_hook(y, 20)
    hit = any(abs(got - c) < 8 for c in (marks['chorus'], marks['chorus'] + 40))
    ok &= hit
    print(f'  {"PASS" if hit else "FAIL"}  --hook found {mmss(got)}; choruses at '
          f'{mmss(marks["chorus"])} and {mmss(marks["chorus"] + 40)}  ({why})')

    # --match, against an excerpt mangled the way a phone recording would be:
    # quieter, band-limited, and buried in room noise.
    TRUE_AT = 72.0
    exc = y[int(TRUE_AT * SR):int((TRUE_AT + 30) * SR)].copy()
    exc = exc * 0.4 + rng.normal(0, 0.05, exc.shape)
    b = np.ones(9) / 9
    exc = np.convolve(exc, b, mode='same')          # crude phone-speaker filter
    at, conf = find_offset(y, exc)
    good = abs(at - TRUE_AT) < 1.5
    ok &= good
    print(f'  {"PASS" if good else "FAIL"}  --match on a degraded excerpt: '
          f'found {mmss(at)}, true {mmss(TRUE_AT)}, off by {abs(at-TRUE_AT):.2f}s '
          f'(match {conf:.3f})')

    # And it must REFUSE a clip that is not in the track at all.
    alien = tone([440.0, 523.3, 659.3], 30, 0.3) + rng.normal(0, 0.01, 30 * SR)
    _, conf2 = find_offset(y, alien)
    refused = conf2 < 0.75 < conf
    ok &= refused
    print(f'  {"PASS" if refused else "FAIL"}  --match refuses a foreign clip: '
          f'{conf2:.3f} against {conf:.3f} for the real one')

    print('\nself test:', 'ALL PASS' if ok else 'FAILURES ABOVE')
    return 0 if ok else 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('target', nargs='?', help='an audio file, or a folder of them')
    ap.add_argument('--len', type=float, default=40.0,
                    help='seconds the cue has to fill (default 40, about a stage)')
    ap.add_argument('--match', help='an excerpt to locate — a phone recording is fine')
    ap.add_argument('--selftest', action='store_true')
    a = ap.parse_args()
    if a.selftest:
        sys.exit(selftest())
    if not a.target:
        ap.error('give an audio file or a folder, or --selftest')

    files = ([a.target] if os.path.isfile(a.target) else
             sorted(sum([glob.glob(os.path.join(a.target, f'*{e}'))
                         for e in ('.mp3', '.m4a', '.wav', '.flac', '.ogg')], [])))
    if not files:
        sys.exit(f'no audio under {a.target}')

    if a.match:
        ref = load(a.match)
        for f in files:
            at, conf = find_offset(load(f), ref)
            # Chroma cosine similarity. Calibrated on the self test, where a
            # correct-but-badly-degraded excerpt scores 0.886 and a clip from
            # another song scores 0.693. Real music has far more chroma
            # variety than the test tones, so a true match sits higher still
            # and a false one lower — these thresholds are deliberately
            # conservative rather than tuned to the synthetic case.
            verdict = ('confident' if conf > 0.85 else
                       'WEAK — check this one by ear' if conf > 0.75 else
                       'NO MATCH — is this the right song?')
            print(f'{os.path.basename(f):34s} startAt: {at:6.1f},   '
                  f'// {mmss(at)}  match {conf:.3f}  {verdict}')
        return

    print(f'{"file":34s} {"startAt":>9s}   hook')
    for f in files:
        at, sc, why = find_hook(load(f), a.len)
        print(f'{os.path.basename(f):34s} startAt: {at:6.1f},   '
              f'// {mmss(at)}  {why}')


if __name__ == '__main__':
    main()
