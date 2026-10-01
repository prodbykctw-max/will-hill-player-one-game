#!/usr/bin/env python3
"""
Encode Will Hill's voice lines for the game — trimmed of the dead air around
each take and NEVER of the take itself.

Source: VOCALS/ in Will Hill's "Player One" Video Game Assets zip (his Google
Drive, sent 2026-09-29), 32-bit float WAVs, one folder per moment. The zip is
re-downloadable, so it is not committed; point --src at its VOCALS folder.

WHY THIS FILE EXISTS. The first encode trimmed with ffmpeg's silenceremove at
-45dB, which is louder than the soft end of a spoken word: every one of the 27
takes lost the tail of its last syllable (30-150ms), "Wooooo" lost 460ms, and
on MANHOLES — "jump over the manholes ... pause" — the "pause" Will added
after a beat was audibly clipped. Will, after playing it: "it got cut off a
lil bit. Any way we can extend the audio to make sure it doesn't get cut off?"

So the trim is measured, not thresholded by a filter:
  * speech = every 10ms window above SPEECH_DB (-60dB), first to last — so a
    second phrase after a pause (MANHOLES' "pause" starts 0.7s after the
    first) is inside the span, never mistaken for the end;
  * kept   = speech plus LEAD before and TAIL after, so the word decays
    naturally into silence rather than being cut on it;
  * then a short fade at each end, the same -16 LUFS level as before
    (loudnorm, single pass — the levels the client already approved), mono,
    96kbps MP3.
tools/voice_takes.json records each take's measured speech length; the
voice.mjs harness fails if any shipped take is shorter than its speech.

⚠️ ONLY MANHOLES HAS BEEN RE-ENCODED THIS WAY. The other 26 takes have the
same few-ms-short tails, and the client chose to leave them exactly as they
shipped ("I just want manholes. Everything else is done") — so this runs
with --only, and voice_takes.json lists only what it has encoded.

Usage:
    python3 tools/encode_voice.py --src "/path/to/VOCALS" --only instructions/manholes
    python3 tools/encode_voice.py --src "/path/to/VOCALS"     # every take
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile

import numpy as np
import soundfile as sf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src', 'assets', 'voice')
SPANS = os.path.join(ROOT, 'tools', 'voice_takes.json')
SPEECH_DB = -60.0     # a 10ms window above this is speech (the room is -90 and below)
LEAD = 0.03           # seconds kept before the first word
TAIL = 0.15           # seconds kept after the last word, so it decays naturally
FADE = 0.03

# Folder and file names as Will sent them -> the game's names. One take's
# filename carries a slur; the game file is named for the moment instead.
RENAME = {'MAN THESE NIGGAS HATING': 'man-these-hating'}


def slug(s):
    return RENAME.get(s, s.lower().replace(' ', '-'))


def ffmpeg():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        return 'ffmpeg'


def speech_span(mono, sr):
    w = int(sr * 0.01)
    n = len(mono) // w
    rms = np.sqrt((mono[:n * w].reshape(n, w) ** 2).mean(axis=1))
    on = np.where(20 * np.log10(rms + 1e-12) > SPEECH_DB)[0]
    if not len(on):
        raise SystemExit('no speech found')
    return on[0] * w / sr, (on[-1] + 1) * w / sr


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', required=True, help='the VOCALS folder from the assets zip')
    ap.add_argument('--only', action='append', default=[],
                    help="re-encode just this take, e.g. instructions/manholes (repeatable)")
    args = ap.parse_args()
    ff = ffmpeg()
    spans = json.load(open(SPANS)) if os.path.exists(SPANS) else {}
    for group in sorted(os.listdir(args.src)):
        gdir = os.path.join(args.src, group)
        if not os.path.isdir(gdir):
            continue
        for fn in sorted(os.listdir(gdir)):
            if not fn.lower().endswith('.wav'):
                continue
            key = f'{slug(group)}/{slug(fn[:-4])}'
            if args.only and key not in args.only:
                continue
            d, sr = sf.read(os.path.join(gdir, fn), dtype='float32')
            mono = d.mean(axis=1) if d.ndim > 1 else d
            s, e = speech_span(mono, sr)
            a = max(0, int((s - LEAD) * sr))
            b = min(len(mono), int((e + TAIL) * sr))
            take = mono[a:b]
            dst = os.path.join(OUT, slug(group), slug(fn[:-4]) + '.mp3')
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            with tempfile.NamedTemporaryFile(suffix='.wav') as tmp:
                sf.write(tmp.name, take, sr, subtype='FLOAT')
                dur = len(take) / sr
                af = (f'afade=t=in:d={FADE},afade=t=out:st={max(0, dur - FADE):.3f}:d={FADE},'
                      'loudnorm=I=-16:TP=-1.5:LRA=11')
                subprocess.run([ff, '-v', 'error', '-y', '-i', tmp.name, '-af', af, '-ac', '1',
                                '-ar', '44100', '-codec:a', 'libmp3lame', '-b:a', '96k', dst],
                               check=True)
            got, gsr = sf.read(dst)
            spans[key] = {'speech_s': round(e - s, 3), 'shipped_s': round(len(got) / gsr, 3)}
            ok = spans[key]['shipped_s'] >= spans[key]['speech_s']
            print(f"{key:58s} speech {e - s:5.2f}s  shipped {len(got) / gsr:5.2f}s  {'ok' if ok else 'SHORT'}")
            if not ok:
                sys.exit(f'{key} came out shorter than its speech')
    with open(SPANS, 'w') as f:
        json.dump(spans, f, indent=1, sort_keys=True)
    print(f'\nwrote {len(spans)} takes and {os.path.relpath(SPANS, ROOT)}')


if __name__ == '__main__':
    main()
