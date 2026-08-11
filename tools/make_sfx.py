#!/usr/bin/env python3
"""
Build the shipped impact samples from Kenney's CC0 Impact Sounds pack.

The pack itself is not committed — it is 800kB of files we use two of, and
`assets/` is git-ignored by convention anyway. This script fetches it, takes
the two the sound pass selected, applies the one bit of processing that
matters, and writes the mp3s that `src/audio/audio.js` imports.

WHY heavy_001 IS FILTERED AND medium_000 IS NOT
-----------------------------------------------
Measured across the pack, Kenney's `impactPunch_*` files are 84-94%
low-frequency energy and run 200-370ms. They are impact THUDS. At full weight
the stomp reads as a kick drum rather than a punch, which is the note that
sent this back the first time.

`medium_000` is the brightest of them at 87% and was kept as recorded.
`heavy_001` at 91.8% was not usable as-is, so its low end is removed.

A shallow filter cannot do this. A 2-pole (12dB/oct) high-pass was tried
first and even cornered at 400Hz only reached 65% — the energy is simply too
concentrated below the corner for a gentle slope to shift. So the filter here
is an FFT brick wall with a raised-cosine transition: silent below 260Hz,
ramping to unity by 700Hz. That takes it to 35.3%, which is a slap that still
has a body behind it.

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

PACK_URL = ('https://kenney.nl/media/pages/assets/impact-sounds/'
            '87b4ddecda-1677589768/kenney_impact-sounds.zip')

SR = 44100
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

# (source file, output name, high-pass or None)
#   high-pass = (stop_hz, pass_hz) for the FFT filter described above.
PICKS = [
    ('impactPunch_medium_000.ogg', 'punch-medium', None),
    ('impactPunch_heavy_001.ogg', 'punch-heavy', (260, 700)),
]


def fetch_pack():
    os.makedirs(WORK, exist_ok=True)
    zpath = os.path.join(WORK, 'kenney_impact-sounds.zip')
    if not os.path.exists(zpath):
        print(f'downloading {PACK_URL}')
        urllib.request.urlretrieve(PACK_URL, zpath)
    return zipfile.ZipFile(zpath)


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


def main():
    z = fetch_pack()
    members = {os.path.basename(n): n for n in z.namelist()}
    os.makedirs(OUT, exist_ok=True)

    for src, name, hp in PICKS:
        if src not in members:
            raise SystemExit(f'{src} not in the pack — did Kenney re-cut it?')
        raw_path = os.path.join(WORK, src)
        with open(raw_path, 'wb') as f:
            f.write(z.read(members[src]))

        d = decode(raw_path)
        before = low_pct(d)
        if hp:
            d = fft_highpass(d, *hp)
            d = d / max(abs(d).max(), 1e-9) * 0.92
        after = low_pct(d)

        wav = os.path.join(WORK, name + '.wav')
        with wave.open(wav, 'w') as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes((d * 32767).astype(np.int16).tobytes())

        mp3 = os.path.join(OUT, name + '.mp3')
        subprocess.run([FFMPEG, '-v', 'error', '-i', wav, '-ac', '1',
                        '-ar', str(SR), '-b:a', '128k', mp3, '-y'], check=True)

        kb = os.path.getsize(mp3) / 1024
        note = f'high-passed {hp[0]}->{hp[1]}Hz' if hp else 'unprocessed'
        print(f'{name:14s} {note:26s} low {before:5.1f}% -> {after:5.1f}%   {kb:5.1f} kB')


if __name__ == '__main__':
    main()
