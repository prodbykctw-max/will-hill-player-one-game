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

**The bench serves the loops the game already ships, not the masters.** The
first design rendered fresh clips from his original tracks, which would have
put 96-148s of each unreleased instrumental on a public URL — against 66-102s
already there. The shipped cuts are the same bytes the CDN is already serving,
so this publishes nothing new, and what he hears is exactly what the game
plays rather than a cleaner render that flatters the join.

The price, and it is a real one: a shipped loop can be trimmed but not
extended, because there is no audio past its end. `masterAvailable` in the
manifest records how much longer each cue COULD run, and the interface says so
per cue, so the limit is visible rather than discovered. Re-rendering a cue
from the master is a deliberate step — see MASTERS below.

**Each bench file starts exactly at its hook.** cut_loop.py cuts them that way
so the native loop is correct, and it means bench time IS loop time: the END
marker reads out the new loop length directly, with no offset to add and no
chance of a number being interpreted against the wrong origin. That
mistranslation is the only way this tool could quietly produce a wrong cut,
so it is designed out rather than documented around.

**The comments are stripped from the published copy.** vite.config.js strips
`<!-- -->` out of index.html at build time because nine of them were shipping
internal conversation into View Source, one quoting the client verbatim. That
plugin runs through `transformIndexHtml`, which never sees files copied from
`public/` — so the same removal is done here, by the same reasoning. The
source file keeps every note.

**public/bench/ is generated, not committed.** It is a 6MB copy of files the
repo already holds. Committing it would put a second copy of every soundtrack
cue in the history permanently, for a tool that exists for about a week;
generating it at deploy time leaves nothing behind. `.gitignore` has the entry.

── MASTERS ───────────────────────────────────────────────────────────────
If a cue turns out to want a LONGER loop than it ships, that one cue has to be
re-rendered from his original track — `--master <slot>` does it, reading
tracks_dir out of the cue sheet. It is opt-in and per-cue on purpose: each one
puts a longer stretch of an unreleased instrumental on a public URL, which is
his call to make and worth making one at a time rather than by default.

Taking it down again is `rm -rf public/bench && bash tools/deploy.sh`, typed
deliberately. This script does not delete anything — a recursive delete living
inside a build script is how a directory gets eaten by accident, and this repo
already carries one scar from that class of mistake.

Usage:
    python3 tools/build_loopbench.py                    # build public/bench/
    python3 tools/build_loopbench.py --master stage_03  # that cue, longer
"""

import argparse
import json
import re
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

# What is already known about each cue, shown next to it so he is not starting
# from nothing. The stage-one line is the measurement that started this: it is
# the specific claim his ear is being asked to confirm or throw out.
NOTES = {
    'stage_01':
        'The one you reported. The first 1.5s comes back at 62.895s — '
        'correlation 0.889 — so the last 3.312s look like a repeat of the '
        'opening, which is the stutter you described. 38 bars would be 62.897s.',
    'stage_02':
        'Cut before the tempo work, so its length is not a whole number of '
        'bars at any tempo.',
    'stage_03':
        'The most material left in the original of any cue — this is the one '
        'that could reach the 120s you asked for.',
    'stage_04':
        'The other one you reported. Currently 52 bars at 174.',
    'title':
        'Cut before the tempo work.',
}

# The longest loop worth auditioning. He asked for "at least 120 secs"; the
# longest cut currently in the game is 102s. Past ~125s there is nothing to
# decide, and every second past it is a second of an unreleased master on a
# public URL for no benefit.
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


def ratio_traps(bpm):
    """The wrong answers a tempo detector actually gives.

    Not arbitrary neighbours: a detector locks onto whichever pulse is
    strongest, so it misses by a RATIO — halves, doubles, and the two-thirds
    that caught this project twice. Offering exactly those as one tap each is
    the difference between a useful guess and a number to be fought with.
    """
    out = []
    for r in (1.5, 2 / 3, 2.0, 0.5):
        b = bpm * r
        if 70 <= b <= 200 and abs(b - bpm) > 1:
            out.append(round(b, 2))
    return out[:2]


def build(masters=()):
    cue = json.loads((ROOT / 'tools' / 'cue_sheet.json').read_text())
    tracks_dir = Path(cue.get('tracks_dir', ''))

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'tracks').mkdir(exist_ok=True)
    entries = []

    for slot, label in SLOTS:
        c = cue['cues'][slot]
        ship = SHIPPED / f'{slot}.mp3'
        if not ship.exists():
            print(f'  {slot:9} MISSING {ship}', file=sys.stderr)
            continue
        shipped = sf.info(str(ship)).duration
        dst = OUT / 'tracks' / f'{slot}.mp3'

        # How much longer this cue COULD run, read from the master when it is
        # reachable. It is only a number for the interface — no audio is taken
        # from the master unless --master names this slot.
        master = tracks_dir / f"{c['track']}.mp3" if tracks_dir.is_dir() else None
        hook = float(c['hook'])
        room = (sf.info(str(master)).duration - hook) if master and master.exists() else shipped

        if slot in masters:
            if not (master and master.exists()):
                print(f'  {slot:9} cannot re-render: {c["track"]}.mp3 not found', file=sys.stderr)
                continue
            y, sr = sf.read(str(master), always_2d=True)
            a = int(round(hook * sr))
            b = min(len(y), a + int(round(BENCH_MAX * sr)))
            sf.write(str(dst), y[a:b], sr, format='MP3', compression_level=COMPRESSION)
            available = (b - a) / sr
            how = 'from the master'
        else:
            # A copy, not a re-encode: these bytes are already on the CDN as a
            # hashed asset, so serving them again publishes nothing new — and a
            # second encode would not be what the game plays.
            dst.write_bytes(ship.read_bytes())
            available = shipped
            how = 'shipped loop'

        bpm = KNOWN_BPM.get(c['track'])
        e = {
            'slot': slot,
            'label': label,
            'track': c['track'],
            'file': f'tracks/{slot}.mp3',
            # Where this clip sits in his original file. The bench never needs
            # it to do arithmetic — the clip starts AT the hook — but it goes
            # into the copied numbers so cut_loop.py gets an unambiguous cue.
            'hook': round(hook, 3),
            'available': round(available, 3),
            'currentLoop': round(shipped, 3),
            'masterAvailable': round(room, 3),
            'bpm': bpm if bpm else estimate_bpm(sf.read(str(ship), always_2d=True)[0][:, 0],
                                                sf.info(str(ship)).samplerate),
            'bpmKnown': bpm is not None,
        }
        if not e['bpmKnown']:
            e['bpmAlternates'] = ratio_traps(e['bpm'])
        if slot in NOTES:
            e['note'] = NOTES[slot]
        entries.append(e)
        print(f'  {slot:9} {label:34} {available:7.2f}s  '
              f'({how}, master has {room:6.2f}s)  {dst.stat().st_size/1e6:.1f}MB')

    (OUT / 'manifest.json').write_text(json.dumps({'cues': entries}, indent=2))
    (OUT / 'index.html').write_text(
        strip_comments((ROOT / 'tools' / 'loopbench.html').read_text()))

    total = sum(f.stat().st_size for f in OUT.rglob('*') if f.is_file())
    print(f'\npublic/bench/ built — {total/1e6:.1f}MB, {len(entries)} cues.')
    print('Published at <site>/bench/ on the next deploy.')
    return 0


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--master', action='append', default=[], metavar='SLOT',
                    help='re-render this cue from the original track so a '
                         'LONGER loop can be auditioned (repeatable)')
    sys.exit(build(tuple(ap.parse_args().master)))
