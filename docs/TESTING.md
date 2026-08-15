# The test section

Category 6 on prodbyKCTW's list: *"we're gonna have to do some testing of all
of this so we need a test section."*

Two halves, and they are different jobs. The **automated suite** grades what a
machine can grade — geometry, pixels, audio levels, state transitions — and it
runs headless in a container. The **device checklist** covers what a container
physically cannot reach: a real iPhone's speaker, its haptic motor, its notch,
and a stranger's thumbs at a party.

---

## 1. The automated suite

Every harness lives in `tools/harness/` and prints `ALL n PASS` or
`FAILED: <checks>` as its last line. They need the dev server up:

```
(nohup npx vite --port 5199 --strictPort > /tmp/vite.log 2>&1 &)
```

and the browser wired in:

```
export PLAYWRIGHT=/opt/node22/lib/node_modules/playwright/index.js
export CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
export SEAM_OUT=shots
```

Run the lot:

```
for h in tools/harness/*.mjs; do
  echo "$h :: $(timeout 300 node "$h" 2>&1 | grep -E '^ALL|^FAILED' | tail -1)"
done
```

⚠️ **`SEAM_OUT=shots` is not optional.** Several harnesses write PNGs and JSON,
and a harness that defaults to the repo root drops them beside the source.
Three separate sweeps have had to clean that up; `shots/` is gitignored.

### ⚠️ Six of these do not print a verdict, and that is not a failure

**Graded** — they end in `ALL n PASS` or `FAILED: <checks>`, and a sweep can
read them mechanically:

`ceiling` · `daylamps` · `endcue` · `idleflex` · `introorder` · `musicbox` ·
`optionsmenu` · `padlift` · `panelnav` · `pausemenu` · `relaytod` · `share` ·
`titlefit` · `titleintro`

**Report-only** — they print a table or a contact sheet for a human to read,
and have no pass/fail line at all:

`daynight` · `graphwire` · `joinshot` · `musiccheck` · `relay` · `seamsweep` ·
`stagestrip`

The one-liner above reports those as `NO VERDICT`. Do not read that as broken —
`seamsweep` prints per-stage seam measurements, `stagestrip` stitches the whole
stage day-above-night for eyeballing, `daynight` prints a difference table.
They are the eyes-on tools; the graded set is the tripwire.

### Last full-suite result

All fourteen graded harnesses green as of the pad-lift commit, 210 checks:

```
ceiling     15    daylamps    12    endcue      11    idleflex     8
introorder   4    musicbox    11    optionsmenu 12    padlift     11
panelnav    13    pausemenu   13    relaytod    26    share       12
titlefit    60    titleintro  12
```

The one failure the sweep surfaced was `ceiling` still demanding WILL HILL
pinned at 50,000 — a decision the client reversed. The harness was wrong, not
the game, and both it and `optionsmenu`'s stale comment were corrected. That is
the point of running the whole thing end to end: a suite nobody runs entire
drifts into grading last month's product and nobody notices.


### What each one is actually protecting

| harness | the failure it exists to catch |
|---|---|
| `daylamps` | streetlamp behaviour at midday — he saw a light pool follow him in daylight |
| `daynight` | day and night variants of all four stages differ where they should |
| `relaytod` | the champagne relay survives a time-of-day switch mid-run |
| `seamsweep` | the plate's tiling join, swept across every stage |
| `stagestrip` | the whole stage as one strip, day above night, for eyeballing |
| `titleintro` | the title assembly, including a far cloud crossing a tower |
| `introorder` | his name lands before PLAYER ONE, measured off the canvas |
| `endcue` | each finish line hands to the next scene's music, no restart |
| `musicbox` | the MUSIC checkbox is the gesture that unmutes, and it persists |
| `musiccheck` | every cue is wired and reaches the master bus |
| `optionsmenu` | the OPTIONS shelf and the leaderboard card, no scrolling |
| `panelnav` | the panel's views and back-navigation |
| `pausemenu` | pause layout and its buttons |
| `share` | the share card renders and is gated behind contest entry |
| `ceiling` | he cannot jump out of the level |
| `idleflex` | the idle animation |
| `graphwire` | the audio graph is connected, not silently bypassed |
| `joinshot` | plate joins |
| `titlefit` | the title card fits every viewport |

### Two rules learned the hard way

**Never assert `!el.paused` for audio.** It stayed true for weeks while the cue
was multiplied by a gain of zero and the game was silent. Read the master bus:
`window.__audio.level()`, peak across ~40 frames, never a single sample — it is
an instantaneous RMS and one read can land on a zero crossing. The first call
builds the analyser and always returns 0; discard it.

**Never trust `page.screenshot()` for pixel comparison.** The loop increments
`tick` between it being set and the frame being taken; two identical runs once
differed by 12,384px. Re-pin the tick across three frames and read
`canvas.toDataURL()` inside ONE `page.evaluate`. And where a measurement can
drift, capture the same state twice and subtract that as noise — the cloud-leak
test does this, and it is the only reason his idle animation stopped being
reported as a cloud.

---

## 2. The device checklist

Everything here needs a real phone. The container cannot do any of it.

### Install and first launch
- [ ] Add to Home Screen on iPhone. Icon is the HUD portrait, not a screenshot.
- [ ] Launch from the icon. The background paints before anything else — no
      white flash, no black gap.
- [ ] **Dynamic Island / notch:** his name and the title are clear of the bar.
      Check on a notched phone AND a small one (SE, 375×667) — they take
      different fit paths and the small one has no slack to give.
- [ ] Rotate to landscape and back. Nothing clips, nothing strands.

### Sound — the one that needs your ears
- [ ] Tap MUSIC on the title. It plays **on that tap**, not after a detour
      through OPTIONS.
- [ ] Volume in a car on max. He measured this before and it was 25%-quiet;
      it is now +5 dB. Confirm on the actual system.
- [ ] Let the title sit two minutes — the loop wraps without a hard cut.
      **This is the known-open one** (loop-seam crossfade, not yet built).
- [ ] Cross a finish line: the map music is already running behind the clear
      card, and tapping through does not restart it.
- [ ] Finish stage four: the credits are already running behind the clear card.
- [ ] Uncheck MUSIC — it actually goes quiet. Reload — it remembers.

### Haptics
- [ ] Stomp an enemy, take a hit, collect champagne — each has its own buzz.
- [ ] Turn haptics off in settings; nothing buzzes.

### A full run
- [ ] All four stages end to end. Note anything in the backgrounds — this is
      the sweep no harness replaces.
- [ ] Die on purpose. The sign-up offer appears, once.
- [ ] Enter the contest. It never asks again, on any later run.
- [ ] Share a run. The card carries the right score and the right brag line.
- [ ] Leaderboard: no scrolling needed, buttons reachable on the card.

### The contest itself — blocked until the backend is up
- [ ] Cloudflare KV namespace created and the Worker deployed.
- [ ] A score submitted from one phone appears on another.
- [ ] Name and score are public; phone and email are not.
- [ ] The 3-day window opens and closes on the right dates.

---

## Known open, and honest about it

- **Loop-seam crossfade.** Cues are cut so their end runs back into their own
  start, but nothing crossfades the seam. Longer masters from prodbyKCTW would
  also solve it.
- **The fall sprite wears a flannel** no other clip has. Blocked on an
  AutoSprite API key.
- **Intro three-beat ordering** (environment → objects → title) is not built.
  `introorder` grades the ordering that *did* ship: his name before PLAYER ONE.
  The three-beat version needs the signs, hero and pole lifted cleanly off the
  plate, and the last inpaint came back smeared.
- **The leaderboard is genuinely empty** until the Worker is deployed. That is
  not a bug to chase on a device.
