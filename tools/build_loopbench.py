#!/usr/bin/env python3
"""Publish the loop bench with his own tracks already loaded in it.

Client: "what would be cool if you created a bench for me to trim each track
to the perfect loop with a little millisecond slider… if you put the wave
files from each track there, I could trim it for each stage… just the four
main stages man and then the intro music."

`tools/loopbench.html` works on its own — drop a file on it and it runs. But
"drop a file on it" means finding an mp3 in Windows Explorer, and he works from
his phone against the live build. So this builds a copy that already has the
tracks in it: open one URL, tap a stage, trim, send the numbers.

── THREE DECISIONS WORTH KNOWING ─────────────────────────────────────────

**Each bench file starts exactly at its hook.** So bench time IS loop time:
the END marker reads out the new loop length directly, with no offset to add
and no chance of a number being interpreted against the wrong origin. That
mistranslation is the only way this tool could quietly produce a wrong cut,
so it is designed out rather than documented around.

**The comments are stripped from the published copy.** vite.config.js strips
`<!-- -->` out of index.html at build time because nine of them were shipping
internal conversation into View Source, one quoting the client verbatim. That
plugin runs through `transformIndexHtml`, which never sees files copied from
`public/` — so the same removal is done here, by the same reasoning. The
source file keeps every note.

**public/bench/ is generated, not committed.** It is ~12MB of his instrumental
masters. Committing that puts it in the repository's history permanently, for
a tool that exists for about a week; generating it at deploy time leaves
nothing behind. `.gitignore` has the entry.

⚠️ THIS PUBLISHES MORE OF HIS MUSIC THAN THE GAME DOES. The game ships 66-102s
of each instrumental; the bench ships from the hook to the end of the usable
material, up to `BENCH_MAX`. It is his music and his call — but it is a real
change in exposure, it goes on a public URL, and he needs to be told so
plainly rather than have it noted in a commit message. Removing it later is
one line: delete public/bench and redeploy.

Usage:
    python3 tools/build_loopbench.py            # build public/bench/
    python3 tools/build_loopbench.py --clean    # remove it again
"""

import argparse
import json
import re
import shutil
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'bench'
SHIPPED = ROOT / 'src' / 'assets' / 'music'

# What he asked for, in the order he wants to work through it: "just the four
# main stages man and then the intro music. All of the transition stages, I'm
# not too much worried about that in the ending stage… people are gonna be on
# those a lot longer than we were anticipating."
SLOTS = [
    ('stage_01', 'STAGE 1 — East Atlanta Village'),
    ('stage_02', 'STAGE 2 — Edgewood'),
    ('stage_03', 'STAGE 3 — Underground'),
    ('stage_04', 'STAGE 4 — Little Five Points'),
    ('title', 'TITLE — the intro music'),
]

# Tempos he gave by hand. A beat tracker read 89 BPM on a track whose filename
# says 135 — two thirds of the truth — which is why the cutter does not snap to
# bars at all. Where he has not said, the bench estimates and SAYS it is
# estimating; the field is editable and the ear is the check.
KNOWN_BPM = {
    'lonliness_2': 174.0,
    'doggzzz': 145.0,
    'mar_10_26': 145.0,
}

# The longest loop worth auditioning. He asked for "at least 120 secs"; the
# longest cut currently in the game is 102s. Past ~125s there is nothing to
# decide, and every second past it is a second of his masters on a public URL
# for no benefit.
BENCH_MAX = 125.0

# Matches the shipped cuts, so what he hears in the bench is what the game
# sounds like rather than a cleaner render that flatters the join.
COMPRESSION = 0.5


def estimate_bpm(y, sr):
    """A proposal, not a measurement. See KNOWN_BPM."""
    try:
        import librosa
        tempo = librosa.beat.tempo(y=y, sr=sr, aggregate=np.median)
        b = float(np.atleast_1d(tempo)[0])
        while b < 70:
            b *= 2
        while b > 200:
            b /= 2
        return round(b, 2)
    except Exception:
        return 145.0


def strip_comments(html):
    """The published copy carries no internal conversation. See the docstring."""
    html = re.sub(r'<!--[\s\S]*?-->', '', html)
    html = re.sub(
        r'<style([^>]*)>([\s\S]*?)</style>',
        lambda m: f'<style{m.group(1)}>' + re.sub(r'/\*[\s\S]*?\*/', '', m.group(2)) + '</style>',
        html, flags=re.I)
    # JS line comments inside the one <script> block. Conservative: only lines
    # whose first non-space character starts the comment, so a `//` inside a
    # string or a URL is never touched.
    html = re.sub(
        r'<script([^>]*)>([\s\S]*?)</script>',
        lambda m: f'<script{m.group(1)}>' + re.sub(r'^[ \t]*//.*$\n?', '', m.group(2), flags=re.M) + '</script>',
        html, flags=re.I)
    return html


def build():
    cue = json.loads((ROOT / 'tools' / 'cue_sheet.json').read_text())
    tracks_dir = Path(cue['tracks_dir'])
    if not tracks_dir.is_dir():
        print(f'Source tracks not found at {tracks_dir}.', file=sys.stderr)
        print('These are his masters and live outside the repo — point '
              'cue_sheet.json "tracks_dir" at them.', file=sys.stderr)
        return 1

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'tracks').mkdir(exist_ok=True)
    entries = []

    for slot, label in SLOTS:
        c = cue['cues'][slot]
        src = tracks_dir / f"{c['track']}.mp3"
        if not src.exists():
            print(f'  {slot:9} MISSING {src.name}', file=sys.stderr)
            continue

        y, sr = sf.read(str(src), always_2d=True)
        hook = float(c['hook'])
        a = int(round(hook * sr))
        b = min(len(y), a + int(round(BENCH_MAX * sr)))
        clip = y[a:b]

        dst = OUT / 'tracks' / f'{slot}.mp3'
        sf.write(str(dst), clip, sr, format='MP3', compression_level=COMPRESSION)

        shipped = sf.info(str(SHIPPED / f'{slot}.mp3')).duration
        bpm = KNOWN_BPM.get(c['track'])
        entries.append({
            'slot': slot,
            'label': label,
            'track': c['track'],
            'file': f'tracks/{slot}.mp3',
            # Where this clip sits in his original file. The bench never needs
            # it to do arithmetic — the clip starts AT the hook — but it goes
            # into the copied numbers so cut_loop.py gets an unambiguous cue.
            'hook': round(hook, 3),
            'available': round(len(clip) / sr, 3),
            'currentLoop': round(shipped, 3),
            'bpm': bpm if bpm else estimate_bpm(clip[:, 0], sr),
            'bpmKnown': bpm is not None,
        })
        print(f'  {slot:9} {label:34} {len(clip)/sr:7.2f}s  '
              f'(now {shipped:6.2f}s)  {dst.stat().st_size/1e6:.1f}MB')

    (OUT / 'manifest.json').write_text(json.dumps({'cues': entries}, indent=2))
    html = (ROOT / 'tools' / 'loopbench.html').read_text()
    (OUT / 'index.html').write_text(strip_comments(html))

    total = sum(f.stat().st_size for f in OUT.rglob('*') if f.is_file())
    print(f'\npublic/bench/ built — {total/1e6:.1f}MB, {len(entries)} cues.')
    print('Published at <site>/bench/ on the next deploy.')
    return 0


def clean():
    if OUT.exists():
        shutil.rmtree(OUT)
        print('Removed public/bench/. Redeploy to take it off the live site.')
    else:
        print('public/bench/ is not there.')
    return 0


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--clean', action='store_true')
    sys.exit(clean() if ap.parse_args().clean else build())
