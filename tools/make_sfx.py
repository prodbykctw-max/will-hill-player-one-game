#!/usr/bin/env python3
"""
Build the shipped sound effects.

Two sources, both deliberate:

STOMP — KC TW's own voice. He recorded twelve mouth-punches into a phone voice
memo while driving, and after cleanup they beat every sample in Kenney's pack
for this job. The pack's `impactPunch_*` files measure 84-94% low-frequency
energy over 200-370ms: they are impact THUDS, and at full weight the stomp
read as a kick drum rather than a punch. His takes are the opposite problem —
1-6% low, pure slap with no body behind them — so each shipped punch is his
slap with a synthesised body layered under it and the pair soft-clipped
together. That lands around 30% low: a slap you can still feel.

Takes 3 and 4 are the ones he picked. They alternate in game so no two stomps
sound identical.

The source recording lives in `assets/sfx-src/` (git-ignored, like all raw
assets) — see CREDITS.md. Without it this script cannot rebuild the punches.

PICKUPS — Kenney Interface Sounds, CC0. `confirmation_003` for money bags,
`confirmation_002` for the champagne power-up. Both chosen by ear off a
comparison bench built from measured candidates; `confirmation_003` is the
shorter and brighter of the two, which is what a frequently-repeated pickup
needs, and `confirmation_002` is longer and rises further, which is what reads
as a power-up glisten.

Usage:
    python3 tools/make_sfx.py

Requires numpy and imageio-ffmpeg (for the encoder).
"""

import os
import subprocess
import urllib.request
import wave
import zipfile

import imageio_ffmpeg
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src', 'assets', 'audio')
WORK = os.path.join(ROOT, 'assets', 'sfx-src')   # git-ignored

IFACE_URL = ('https://kenney.nl/media/pages/assets/interface-sounds/'
             'fa43c1dd4d-1677589452/kenney_interface-sounds.zip')

# KC TW's voice memo. Offsets in seconds of the two hits he chose, measured by
# transient detection over the 8.13s recording.
VOICE_SRC = 'kctw-punches.m4a'
VOICE_TAKES = [('punch-a', 6.48), ('punch-b', 5.76)]

# How much of the hit's energy should sit below 500Hz. A fixed body gain does
# not work: at one setting take 3 landed at 57% and take 4 at 69%, so the two
# alternating punches did not even match each other. The gain is solved per
# take to hit this instead, which makes them consistent AND keeps the target
# in one readable place. 30% is a slap with weight behind it; Kenney's
# unusable thuds were 84-94% and the raw voice takes were 1-6%.
TARGET_LOW = 30.0

SR = 44100
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

# (source file in the Interface pack, output name)
IFACE_PICKS = [
    ('confirmation_003.ogg', 'coin'),
    ('confirmation_002.ogg', 'glisten'),
]


def fetch_pack(url, name):
    os.makedirs(WORK, exist_ok=True)
    zpath = os.path.join(WORK, name)
    if not os.path.exists(zpath):
        print(f'downloading {url}')
        urllib.request.urlretrieve(url, zpath)
    return zipfile.ZipFile(zpath)


def synth_body(n):
    """The weight under the slap: a triangle pitched down fast, plus a sub.

    His recording is almost pure high end — the slap is all there, the body is
    not, because a mouth cannot make one. This is the same body layer the
    synthesised punch used, generated here so the script needs no browser.
    """
    t = np.arange(n) / SR
    # exponential sweep 190 -> 48Hz over 130ms, then hold
    f = 190.0 * (48.0 / 190.0) ** np.clip(t / 0.13, 0, 1)
    tri = 2 / np.pi * np.arcsin(np.sin(2 * np.pi * np.cumsum(f) / SR))
    sub = np.sin(2 * np.pi * np.cumsum(85.0 * (38.0 / 85.0) ** np.clip(t / 0.11, 0, 1)) / SR)
    env = np.exp(-t / 0.055)
    att = np.clip(t / 0.006, 0, 1)
    return (tri * 0.85 + sub * 0.4) * env * att


def solve_body_gain(seg, target=TARGET_LOW):
    """Bisect the body level until the mix hits `target` low-frequency share."""
    lo, hi = 0.0, 3.0
    for _ in range(18):
        mid = (lo + hi) / 2
        if low_pct(mix_punch(seg, mid)) < target:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def mix_punch(seg, body_gain):
    body = synth_body(len(seg)) * body_gain
    mix = np.tanh((seg * 0.95 + body) * 1.4) / np.tanh(1.4)
    return mix / max(abs(mix).max(), 1e-9) * 0.94


def make_punch(sig, sr, at, body_gain=None):
    """Cut one take, strip the road noise, layer the body, soft-clip."""
    a0, a1 = int((at - 0.04) * sr), int((at + 0.30) * sr)
    seg = sig[max(0, a0):min(len(sig), a1)].copy()
    seg[:200] *= np.linspace(0, 1, 200)
    seg[-1200:] *= np.linspace(1, 0, 1200)
    # The car is all below 180Hz; the slap is all above it.
    seg = fft_highpass(seg, 120, 180)
    seg = seg / max(abs(seg).max(), 1e-9) * 0.92

    g = solve_body_gain(seg) if body_gain is None else body_gain
    return mix_punch(seg, g), g


def decode(path):
    tmp = os.path.join(WORK, '_decode.wav')
    subprocess.run([FFMPEG, '-v', 'error', '-i', path, '-ac', '1',
                    '-ar', str(SR), '-f', 'wav', tmp, '-y'], check=True)
    with wave.open(tmp) as w:
        raw = w.readframes(w.getnframes())
    return np.frombuffer(raw, dtype=np.int16).astype(np.float64) / 32768


def fft_highpass(x, stop_hz, pass_hz):
    """Silent below `stop_hz`, raised-cosine ramp to unity at `pass_hz`."""
    n = 1 << int(np.ceil(np.log2(len(x) + 1)))
    spec = np.fft.rfft(x, n)
    freq = np.fft.rfftfreq(n, 1 / SR)
    gain = np.ones_like(freq)
    gain[freq <= stop_hz] = 0.0
    band = (freq > stop_hz) & (freq < pass_hz)
    gain[band] = 0.5 - 0.5 * np.cos(np.pi * (freq[band] - stop_hz) / (pass_hz - stop_hz))
    return np.fft.irfft(spec * gain, n)[:len(x)]


def low_pct(x):
    """Share of energy below 500Hz — the measure that decided all of this."""
    a = np.exp(-2 * np.pi * 500 / SR)
    lp = lo = hi = 0.0
    for v in x:
        lp = a * lp + (1 - a) * v
        lo += lp * lp
        hi += (v - lp) ** 2
    return 100 * lo / (lo + hi + 1e-12)


def encode(d, name):
    wav = os.path.join(WORK, name + '.wav')
    with wave.open(wav, 'w') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((d * 32767).astype(np.int16).tobytes())
    mp3 = os.path.join(OUT, name + '.mp3')
    subprocess.run([FFMPEG, '-v', 'error', '-i', wav, '-ac', '1',
                    '-ar', str(SR), '-b:a', '128k', mp3, '-y'], check=True)
    return os.path.getsize(mp3) / 1024


def main():
    os.makedirs(OUT, exist_ok=True)

    voice = os.path.join(WORK, VOICE_SRC)
    if not os.path.exists(voice):
        raise SystemExit(
            f'Missing {voice}\n'
            "KC TW's voice memo is git-ignored with the rest of assets/. "
            'Put it back before rebuilding the punches.')
    sig = decode(voice)
    for name, at in VOICE_TAKES:
        d, g = make_punch(sig, SR, at)
        kb = encode(d, name)
        print(f'{name:14s} voice @{at:5.2f}s + body x{g:4.2f}   '
              f'low {low_pct(d):5.1f}%   {kb:5.1f} kB')

    z = fetch_pack(IFACE_URL, 'kenney_interface-sounds.zip')
    members = {os.path.basename(n): n for n in z.namelist()}
    for src, name in IFACE_PICKS:
        if src not in members:
            raise SystemExit(f'{src} not in the pack — did Kenney re-cut it?')
        raw_path = os.path.join(WORK, src)
        with open(raw_path, 'wb') as f:
            f.write(z.read(members[src]))
        d = decode(raw_path)
        kb = encode(d, name)
        print(f'{name:14s} Kenney {src:22s} low {low_pct(d):5.1f}%   {kb:5.1f} kB')


if __name__ == '__main__':
    main()
