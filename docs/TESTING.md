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

⚠️ **`loopbench` needs `public/bench/` built first**, and it must be reached by
its explicit filename:

```
python3 tools/build_loopbench.py          # writes public/bench/ (gitignored)
node tools/harness/loopbench.mjs          # -> /bench/index.html
```

Vite's dev server answers a bare directory with the APP's `index.html` — its
SPA fallback — so `http://localhost:5199/bench/` grades the game instead of
the bench, silently and with confusing errors. Static hosting (which is what
Pages is) serves `index.html` for the directory, so the URL the client gets is
`/bench/` and it is correct there.

### ⚠️ Six of these do not print a verdict, and that is not a failure

**Graded** — they end in `ALL n PASS` or `FAILED: <checks>`, and a sweep can
read them mechanically:

`barescars` · `betweenscreens` · `btnglow` · `ceiling` · `cloudseal` · `daylamps` · `endcue` · `entryfit` · `entrypaths` · `finishrun` · `howpage` · `idleflex` · `introorder` ·
`loopbench` · `loopseam` · `musicbox` · `outbox` · `todlive` · `optionsmenu` · `padlift` · `panelnav` · `pausemenu` · `relaytod` ·
`share` · `stageflag` · `titlefit` · `titlehome` · `titleintro`

**Report-only** — they print a table or a contact sheet for a human to read,
and have no pass/fail line at all:

`daynight` · `graphwire` · `joinshot` · `musiccheck` · `relay` · `seamsweep` ·
`stagestrip` · `stagesweep`

The one-liner above reports those as `NO VERDICT`. Do not read that as broken —
`seamsweep` prints per-stage seam measurements, `stagestrip` stitches the whole
stage day-above-night for eyeballing, `daynight` prints a difference table.
They are the eyes-on tools; the graded set is the tripwire.

### Last sweep

**Green after the sign-up cabinet became a card** — 32 harnesses against a
fresh dev server, zero failures: betweenscreens 20, entryfit 44, optionsmenu
15, btnglow 27, hapticbtn 24, panelnav 13, startflow 23, entrypaths 9,
titlefit 76, titleintro 12, endcue 11, relaytod 26, dashglow 26, pausemenu 13,
musicbox 11, share 12, outbox 13, ceiling 15, howpage 24, idleflex 8,
padlift 11, introorder 4, todlive 12, stageflag 6, dashload, and relay /
joinshot / graphwire / daynight / barescars / finishrun / musiccheck clean on
their own wordings.

⚠️ **`optionsmenu` was red on `origin/main` and had been for a while** — five
checks, and only two of them were the sign-up becoming a layer. The other three
were defending the flow `ca4e5a2` replaced: that a brand-new device is never
stopped by the form, that the offer is latched in localStorage, and that NOT
NOW goes straight to `playing`. All three are now deliberately false. It was
verified against a worktree of `origin/main` before being changed, which is the
only way to tell a stale harness from a regression you just caused — the two
look identical from inside your own branch.

⚠️ Read the verdict LINE, not the exit code, and not a grep for `ALL n PASS`
either. Three of those harnesses end on a different wording — `ALL PASS` with
no count, `ALL n/n PASS`, or a report with no verdict at all — so a sweep that
greps one pattern prints `NO VERDICT` for perfectly green runs and looks like
a failure. It happened again this session.

An earlier full pass at `47249b3` ran all 32: **24 graded, 355 checks, zero
failures.** The 8 report-only harnesses ran clean — which means they produced
their sheets, not that they graded anything.

### The music box, and the settings panel agreeing with it

`tools/harness/musicbox.mjs` (16 checks) covers the title-card MUSIC box — that
one press both stores the preference and is the gesture the browser accepts,
that sound genuinely reaches the master bus, and that the choice survives a
reload.

It now also opens a **fresh browser context** and checks the OPTIONS panel
agrees. That context is the whole point: `fillSettings()` read `wh_sound` as
`!== 'off'` while `soundEnabled()` reads it as `=== 'on'`, so the panel showed
music ON next to silence — but *only* on a device that had never answered.
Any earlier tap in the file hides it. If a setting has a non-obvious default,
the test for it needs a profile that has never been used.

The check was confirmed to FAIL against the old line before being kept. A
regression test nobody has watched fail is a comment.

### The combo chain, and the point it must never score

`tools/harness/combo.mjs` (12 checks). It drives the real update loop — nothing
calls `resolveEnemyCollision` directly, or it would be grading a function
rather than the game — and asserts the chain counts, that landing breaks it,
that the run's best survives landing, and that the log carries each new best.

**The load-bearing check is the negative one:** five stomps must move the score
by exactly 250 and not one point more. A combo bonus would shift a ceiling that
is measured (61,650) against a refusal threshold (70,000) and a 400/second rate
check, and the symptom would not be a wrong number on screen — it would be a
great run refused mid-contest as `implausible-rate`.

It also measures the *design premise* rather than trusting arithmetic in a
comment: a post-stomp bounce carries 256px, and the generator's tightest enemy
spacing is 256px, so a chain is reachable by exactly nothing to spare.

⚠️ **It earned its keep on the first run.** The chain-reset line had been
written beside a near-identical `onGround` test that lives inside
`if (isRelay())`, so it shipped resetting only under a dev flag nobody plays —
the combo counted up all run and never cleared. Every other check went green.
Two harness bugs surfaced first and are worth knowing as shapes: hand-built
enemy objects with an invalid `variant` killed the renderer mid-chain and read
exactly like the combo failing, and forcing `player.onGround = true` proved
nothing because `updatePlayer` recomputes it from the map every frame — the
test now lands him on real ground and asserts he got there.

### Does the number fit the box he painted?

`tools/harness/dashfit.mjs`. Every value on the dashboard is a transparent box
positioned at a measured percentage of his artwork, and `#plate>*` is
`overflow:hidden` — so a value that outgrows its rect is not wrapped or
shrunk, it is **sheared**, and the page prints a wrong number with total
confidence. At four million deaths the DEATHS total rendered `.237.89`.

It fills the page from the worker itself at two data scales (what the board
holds today, and seven figures in every column) across a phone width and the
760px the stylesheet caps to, and it measures the RENDERED text with a Range
over each element's own text node.

⚠️ **Two ways this harness lied before it worked**, both worth knowing because
they are the generic shapes of a lying harness:

- Measuring a clone styled from `getComputedStyle(el).font` — that comes back
  **empty** in Chromium, the clone falls back to 16px, and every box reports a
  comfortable pass while the page is visibly torn.
- Counting wrapped lines as `height / line-height` — computed `line-height` on
  these elements is the string `normal`, `parseFloat` gives `NaN`, `NaN > 1`
  is false, and a value it could see wrapping was reported green.

Its known-open list is **empty**, and that is load-bearing. It held the four
STAGE PROGRESSION values while their string was still `N (P%)` — 115px of
text in the 61px his panel leaves. They print the count alone now and fit, so
the entry was deleted and the check tightened by itself, which is the whole
point of listing a known gap instead of quietly skipping it. Anything added
back needs a reason and a place it is written up.

### Load, measured — not assumed

`tools/loadtest.mjs` against the live worker, and `tools/harness/dashload.mjs`
against the page the worker serves. ⚠️ The load test writes to the REAL contest
database; everything it creates is named `LOADTEST-` and `--clean` prints the
SQL that removes it. Run it, then check the counts — his board must not launch
with ten thousand fake people on it.

⚠️ It also costs D1 write quota: **4 rows written per submit**, so 10,000
entries is ~40k writes to create and ~40k to delete. On the free tier's
100k/day that is most of a day. Do it on a day the contest is not live.

**The worker, at 10,000 entrants**

| test | result |
|---|---|
| 200 runs from ONE player, simultaneously | all 200; board kept the true max, counted **all 201** plays |
| ... then a LOWER score arrived after | ignored, correctly — the max survived |
| the same run id posted 50 times at once | exactly **1** accepted, **49** refused 409 |
| **10,000 distinct players**, conc 50 | **10,000/10,000, zero errors** · p50 806ms, p99 1.8s, 58/s |
| 23,415 board reads during that flood | **98% edge-cache HIT**, p50 47ms, zero errors |
| the same at 1,000 players | p50 737ms — **throughput did not degrade 10x** |
| heaviest dashboard query at 10,001 rows | 1.3ms of SQL |
| `/top?n=20` with 10,001 rows behind it | 20 rows, 1.35KB, 884ms cold / 47ms cached |

The race is the one worth having run: it is the exact failure the KV design
had, where two players finishing together meant the second write erased the
first. `MAX()` inside the upsert holds — and the accidental version of the test
was better than the designed one, because the flood's phone range overlapped
the race's, so a LOWER score landed after the high one and was correctly
ignored.

**The page, at 10,000 entrants** — three defects that one row cannot show:

| | before | after |
|---|---|---|
| the 5s poll, forever | 133ms | **16ms** |
| opening ALL ENTRANTS | 6,689ms | **1,281ms**, readable immediately |
| DOM nodes | 10,080 | **1,140** |

The poll was rebuilding every row into a window three rows tall; the inline
lists are capped now. The open table only repaints when its data actually
moved. And it paints the first 300 rows immediately and fills in behind him on
animation frames — sorted by score, so the rows that matter are in the first
batch by definition.

**The game is insulated from contest size**, and that was checked rather than
assumed: it reads `/top?n=20`, capped at 50 server-side, so its board renders
5 rows in 1.2s with 10,001 rows in the table and no scrolling in either axis.

### What no harness in here can tell you

**Haptics on iOS.** Playwright's "iPhone" profile is Chromium wearing an iOS
user-agent, and it reports `navigator.vibrate` as a function — which real
Safari does not. Any check written against it grades the harness, not the
product. The answer came from `public/haptic.html`, a deployed page of
side-by-side routes with a control the client operates himself. Settled:
a scripted click never produces a haptic; a real finger on a hidden switch
does; the buzz lands on release; and iOS throttles it under repeated taps. See
LESSONS.md 20 for how four fixes went in before anyone asked that question.

```
barescars    8    betweenscreens 20  btnglow     27    ceiling     15
cloudseal   12    daylamps    12    dashglow    26    endcue      11
entryfit    44    entrypaths   9    finishrun   12    hapticbtn   24
howpage     24    idleflex     8    introorder   4    loopbench   32
loopseam     9    musicbox    11    optionsmenu 15    outbox      13
padlift     11    panelnav    13    pausemenu   13    relaytod    26
share       12    stageflag    6    startflow   23    titlefit    48
titlehome   69    titleintro  12    todlive     12
```

⚠️ `titlefit` reads **48 now, not 76**, and that is not a loss of coverage.
Three of its per-shape checks measured where OPTIONS and MUSIC sat relative to
each other, from when OPTIONS was his painted word with a box stacked under it.
The controls are laid out from the SCREEN now and there are three of them in a
row, so that geometry moved to `titlehome` — which grades 69 — along with
`relaytod`'s stacked-MUSIC assertion. 76 → 48 + 69 is the shape of the move.

⚠️ **Do not sweep on exit codes alone.** A first pass here graded all 32 by
`$?` and reported "32 of 32". That number is true and it is not the claim that
matters: 8 of those never grade anything, so the honest figure was 24. Read the
verdict LINE.

And when you grep for it, match all three wordings — `ALL n PASS`,
`ALL n/n PASS` (`barescars`, `finishrun`) and `n/n checks pass` (`loopbench`).
A pattern that only catches the first reports three passing harnesses as
missing, which reads exactly like a harness that broke.

`loopseam` went 11 → 9 deliberately: two of its checks demanded that the
two-element lap ENGAGE, and a buffer-backed cue has no lap. Grading that would
now be grading the absence of the fix. It grades what the lap existed for —
the bus not dipping at the seam — and still checks the lap's own failure
reporting on cues genuinely still on an element.

Earlier sweeps, for the record: a PARTIAL one at `b1a9dec` covering only what
the audio-engine change could touch; fourteen graded / 210 checks at the
pad-lift commit; twelve / 202 after the title, touch and viewport work. The
overdue full run this section used to call for is the one above. CAT 6 still
wants a re-run against the final build, plus the on-device checklist no
harness replaces.

### Three things verified without a harness, and why

Not everything earned a permanent file. These were measured inline, and the
numbers are recorded here so a later session can re-run them rather than
wonder:

- **A pad released off its own edge.** Press ▶, drag onto the canvas, release
  there; the pad must not stay lit. `.on` is driven by the same `set()` that
  holds the key, so the class *is* the key state, not decoration. Worth
  promoting into `padlift` if touch is ever reworked — add the two-finger case
  too (hold ▶, tap JUMP, release JUMP, ▶ still down), since the old fix for
  this bug broke exactly that.
- **The map cue prefetches.** `__startStage(0)`, teleport the player to 30% and
  60% of `finishLineX`, watch `state.mapWarmed` and the network. False at 30%,
  true at 60%, `map_01_02` fetched before the line.
- **The installed app's short box.** `__standaloneOverride` +
  `__screenHeightOverride` (beside the existing `__safeTopOverride`) emulate a
  898px web view on a 932px screen: the canvas must grow to 932 with zero
  uncovered rows. Chromium cannot launch as an installed iOS app, so this
  emulation is the ceiling of what can be proved here — the client's own
  screenshot is the real check.

### Measuring a loop, not eyeballing it

`tools/cut_loop.py --plan` reports each cue's join, and `wrap_continuity()` is
the number that matters: the spectrum of the 50 ms leading into the cut against
the 50 ms the loop returns to, normalised by 200 random interior splices of the
same track. **1.0 is an ordinary moment in that music; over ~2× is a join you
hear every wrap.** Ranked as of 2026-08-16 — `stage_01` 3.36× is the worst and
is waiting on its BPM, `stage_04` 1.37× and `ui_pause` 1.17× are re-cut,
`title` 0.53× was already the cleanest in the set.

`titlefit` grew 60 → 76 and then narrowed to 48: five shapes day and night
asserting the box spans the viewport, the plate reaches both edges, and no row
at either end is the clear colour — plus a break-test that shortens the box by
34px and proves the band comes back, since Chromium cannot launch as an
installed iOS app. What it shed is the control geometry, which is `titlehome`'s
subject now. This file asks about the PAINTING; that one asks about the buttons.

`titlehome` is the newer one and it carries a lesson worth reading before
writing any pixel check on this card. Its ghost test reads the old OPTIONS
rows off the LIVE canvas, not off the asset, because the asset measured clean
while the word was plainly on screen: `title-portrait-skyline.webp` reads as
"the towers" but below the sky it is a byte-exact copy of the whole plate,
drawn full-frame at depth 0.020, and it repainted the word straight back on
top at no parallax offset. Only the composited canvas has every layer in it.
On the two shapes whose controls happen to cover those rows there is nothing
left to measure and the check says so rather than passing quietly, and a
break-test swaps the pristine plate onto the SKYLINE card — not the base, which
changes nothing — to prove the metric can still go red.

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
| `titlehome` | the home page's three controls: 44px targets on six shapes, nothing over PRESS START, the contest banner routes both ways, and only ONE OPTIONS on screen |
| `titleintro` | the title assembly, including a far cloud crossing a tower |
| `introorder` | his name lands before PLAYER ONE, measured off the canvas |
| `endcue` | each finish line hands to the next scene's music, no restart |
| `musicbox` | the MUSIC checkbox is the gesture that unmutes, and it persists |
| `musiccheck` | every cue is wired and reaches the master bus |
| `optionsmenu` | the OPTIONS shelf and the leaderboard card, no scrolling |
| `panelnav` | the panel's views and back-navigation |
| `pausemenu` | pause layout and its buttons |
| `entryfit` | the cropped sign-up card fits, its controls land on his paint, and the backdrop cannot be tapped through the scrim |
| `betweenscreens` | STAGE CLEAR / GAME KNOCKED / the ending each have a reachable button — and a tap OFF one does nothing, which is the half nobody would notice until the game is a dead end. Also that the ending's board arrives on its own, exactly once, and that dismissing it lands back on his painting rather than a dead screen |
| `share` | the share card renders and is gated behind contest entry |
| `ceiling` | he cannot jump out of the level |
| `idleflex` | the idle animation |
| `graphwire` | the audio graph is connected, not silently bypassed |
| `joinshot` | plate joins |
| `titlefit` | the title card fits every viewport — and reaches the head AND foot of it, with no background row at either end (the installed-app band) |
| `barescars` | the intro's sky is clean where the lettering will land: as textured as the belt beside it, with no letter-shaped ghost |
| `cloudseal` | weather passes BEHIND the buildings on all four day stages — and is still visible. ⚠️ It TRAVELS now: five camera positions from spawn to the finish line. It used to measure at spawn only, where every card's offset is zero by construction, so it was green throughout the weeks the client was photographing the bug. It also reports how many samples it had to discard because the camera moved mid-grab, and carries a named `ALLOW` ratchet for two pre-existing leaks on `eav` and `l5p` that may only go down |
| `endcue` | each finish line hands to the NEXT scene's music, with no restart |
| `howpage` | HOW TO PLAY is ONE page of ✕/✓ pairs, its control badges are the game's OWN pads compared by computed style — no ✓ without its ✕ (the fault that killed the first one-pager), the champagne frames really differ at the bags, the copy stays under a word ceiling, and it fits one screen at 430x932 AND 320x568 |
| `loopseam` | a looping cue's wrap is seamless — by decoded buffer now, by the two-element lap only when a cue is still on an element |
| `todlive` | changing TIME OF DAY does not reload, stop the music, or close the panel — driven through the real `#sTod`, which `relaytod` cannot see |
| `outbox` | a score survives everything: held before registration, kept across a reload, retried after a failed submit, never re-sent once accepted |
| `loopbench` | the trimming bench's READOUT and its AUDIO agree — the crossfade it previews is `crossfade_wrap()`'s own, sample for sample, and the copied `hook` is the original-file coordinate |
| `entrypaths` | a run reaches the board whether they enter before OR after it |
| `padlift` | the movement pads' height, solidity, seam, and that a press still lights them |
| `stageflag` | `?relay=1` / `?stage=N` work AND a plain URL is still the player's game |
| `stagesweep` | every screen of every stage, day and night, for background review |

### Two rules learned the hard way

**Never assert `!el.paused` for audio.** It stayed true for weeks while the cue
was multiplied by a gain of zero and the game was silent. Read the master bus:
`window.__audio.level()`, peak across ~40 frames, never a single sample — it is
an instantaneous RMS and one read can land on a zero crossing. The first call
builds the analyser and always returns 0; discard it.

**⚠️ NEVER SLEEP A FIXED NUMBER OF MILLISECONDS AND CALL IT A CONTRACT.**
`share.mjs` waited 400ms after tapping SHARE and started reporting the entire
share feature as dead — no download, no clipboard, no error. Nothing was
broken: the card is an 852x1846 canvas encoded to a 2.5MB PNG and on a loaded
machine that lands at about **four seconds**. 400ms had never been a contract,
just a number that used to be enough. Poll the condition
(`page.waitForFunction`) instead. The same fault in a different costume:
`endcue.mjs` read the music cue on the same frame the screen flipped and got
the PREVIOUS screen's answer, because `update()` asks for the cue at the top
and the branch that changes the screen runs below it — three stages passed and
one failed in the same run, on identical code.

**A harness can be wrong about the product, not just about the timing.**
`ceiling.mjs` still demanded WILL HILL pinned at row 1 with 50,000 — a
benchmark the client had asked to be REMOVED. The suite went red on correct
code. Run the whole suite end to end regularly, or it quietly drifts into
grading last month's product. And `introorder.mjs` called a
`__title.settledAt()` that was designed for an unshipped feature and never
existed, then polled a `g.introT` that is a local inside `draw()` — it threw,
and once that was fixed it hung for four minutes on a counter pinned at zero.
A harness nobody has actually run is a comment.

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

- **⚠️ MUSIC IS WEB AUDIO NOW, AND A HARNESS MUST NOT ASSUME AN ELEMENT.**
  A looping cue decodes to an `AudioBuffer` and loops in the graph; the media
  element is the fallback. `status().mode` says which, and `status().el` is
  SYNTHESISED for a buffer cue so the existing fields still read true. A check
  written against `el.paused` would now report a healthy game as silent — the
  same trap `musicbox` was written for, one layer down. Grade the master bus.

- **Loop points, now that the seam itself is handled.** ~~Nothing crossfades
  the seam~~ — stale, and it was stale for a while: `crossfade_wrap()` in
  `cut_loop.py` bakes a 15ms equal-power fade into every cut, and `music.js`
  laps a cue across two elements so the wrap is crossed rather than wrapped
  (`loopseam` grades it off the master bus). What is genuinely open is where
  the loops should END — he hears stage one repeat two bars, which no seam
  measurement can see. That is his call at `/bench/`, not a check to write.
- ~~**The fall sprite wears a flannel**~~ — fixed. The pose was regenerated
  with the scenery banned by name; every fall frame now matches idle's
  wardrobe. Checked frame by frame, not assumed.
- **Intro three-beat ordering** (environment → objects → title) is not built.
  `introorder` grades the ordering that *did* ship: his name before PLAYER ONE.
  The three-beat version needs the signs, hero and pole lifted cleanly off the
  plate, and the last inpaint came back smeared.
- **The leaderboard is genuinely empty** until the Worker is deployed. That is
  not a bug to chase on a device.
