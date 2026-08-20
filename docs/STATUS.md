# WILL HILL: PLAYER ONE — full status

**Written for a fresh session or a new chat.** Everything shipped, everything
proposed, everything not done, everything undone, everything on hold.

- Repo: `prodbykctw-max/will-hill-player-one-game`
- `main` and `claude/last-markdown-game-link-lvk1n6` are both at **`b1a9dec`**
- Live: <https://prodbykctw-max.github.io/will-hill-player-one-game/>
- Loop bench: <https://prodbykctw-max.github.io/will-hill-player-one-game/bench/>
- `gh-pages` was rebuilt from `b1a9dec`. Live matches main — verified on the
  CDN by bundle hash and by `createBufferSource` being present in it.

---

## ⚠️ Read this before touching anything

1. **The container has rolled back NINE times.** (Twice in the title-screen session alone — the second one ate an uncommitted tool rewrite AND the plan file, which is why the rule below is now *push after every file write*, not after every chunk.) Local `HEAD` silently reverts
   to an older commit and uncommitted work disappears. The worst one landed
   mid-session on a tree that predated two finished, pushed commits — running
   the merge that had been asked for would have overwritten them with an older
   copy of themselves. **Origin is the only truth.** Before starting:
   `git fetch origin main && git reset --hard origin/main`, and verify the
   reset took (`grep -c skystruct src/world/stages.js` must be 8) before
   trusting the tree. Commit and push after *every* completed chunk.
2. **Never `git add -A` on the `gh-pages` branch.** A sibling project leaked
   private files that way and its history had to be purged. Use
   `bash tools/deploy.sh`, which stages explicit paths and rebuilds
   `gh-pages` as a fresh orphan.
3. **Do not edit his artwork to solve a UI problem.** See "Undone" below —
   tried once and rightly rejected.
4. **Never claim something works without measuring it.** House rule from the
   client, and it keeps catching real bugs — an audio element that reported
   "playing" while silent for weeks, a harness reading its own damage flash as
   backdrop light, a share feature reported dead that was merely slow.
5. **⚠️ EVERY CHECK HERE RUNS IN CHROME. HIS PHONE IS SAFARI.** The blank
   leaderboard shipped green through a full suite and was broken on the only
   device that matters: Chrome resolves a parent sizing itself from a child's
   `aspect-ratio`, Safari returns zero. When a change is CSS layout, assume the
   harness cannot see the bug.

---

## Environment

```
dev server   (nohup npx vite --port 5199 --strictPort > /tmp/vite.log 2>&1 &)
harness      PLAYWRIGHT=/opt/node22/lib/node_modules/playwright/index.js \
             CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
             SEAM_OUT=shots node tools/harness/<name>.mjs
build        npm run build
deploy       bash tools/deploy.sh
```

**Dev URL flags** — URL only, never a button, nothing a player is shown:

| flag | does |
|---|---|
| `?relay=1` | CHAMPAGNE RELAY: no enemies, no pit deaths, aura always lit |
| `?stage=1..4` | start on that stage (one-indexed; out of range → stage 1) |
| `?tod=day` / `night` | force the time of day (the default is **Atlanta's** clock, not the device's — see `timeOfDay()`) |
| `?lb=<url>` | point the leaderboard client at a stub — **DEV BUILD ONLY**, folded to dead code by Vite in production |

Screenshots default to `shots/` (gitignored). Scratch work goes in the session
scratchpad, never the repo root.

---

## DONE — shipped and live

### "Loading issues" — the deploys themselves were breaking live players

Client, from a live phone share: *"We're having loading issues with the game."*
Root-caused with live-host probes, gh-pages history, a route-intercept
experiment on the production build, and a file:line audit of the whole boot
path. Three confirmed causes; the loader-fragility one (`images.js`,
no-retry `Promise.all`) is another session's lane and is not touched here.

**1. Every deploy stranded live players.** gh-pages is force-pushed as a fresh
orphan, deleting every previously published hashed file — while `index.html`
is served `cache-control: max-age=600` (the page's `<meta>` no-cache tags are
inert; the comment claiming otherwise was false) and an installed PWA can hold
it far longer. **Seven deploys on 2026-08-18** made seven windows in which a
real phone held an index whose bundle 404s: the module never runs, and the
error screen lives inside the module that failed — black screen, no message.
Measured: one 404'd boot asset → canvas 0.3% lit (dead) or stuck at the
loading card forever, vs 79.9% healthy.

**Fixed by publishing the UNION** (`tools/deploy_union.py`, called from
`deploy.sh`): recent generations' `assets/` files are carried beside the new
build (hashed names cannot collide), aged out by `asset-ledger.json` after
`RETAIN_DAYS` (14). The first union deploy also mined today's six deleted
trees out of the reflog, **un-bricking everyone stranded today**. Proof: the
13:31 deploy's stale `index.html` served over the union tree boots to a
79.9%-lit title with zero 4xx — identical to healthy.

**2. `title.mp3` raced the boot download.** `music.play()` ran from the first
frame of the LOADING screen (the cue map sends `'loading'` to the title cue),
fetching 461 KB against the title art, even with MUSIC off. The loading
early-return now sits above it; verified on a throttled connection: zero
`.mp3` requests until `screen === 'title'`. All audio harnesses green
(`musicbox` 20, `endcue` 11, `loopseam` 9, `graphwire`, `pausemenu` 13).
`musiccheck`'s "4 MISMATCHED" durations were cue-sheet bookkeeping drift —
the client re-cut four cues on 2026-08-16 and the harness table still held
the 08-13 numbers. Fixed in `0fab986`: `cue_sheet.json` now carries a `dur`
per cue measured from the shipped files and the harness reads it; all ten
match.

**3. A boot audit found one black-screen landmine**: `audio.js`'s `ensure()`
built the audio graph OUTSIDE its try, synchronously at import — a Safari
denied-audio throw would have aborted the whole bundle. The try now covers the
graph. Two adjacent findings (the error screen survives <1 frame before the
LOADING card repaints over it; no timeout on the boot chain) are **handed to
the loader session via MERGE_STATE**, not fixed here — they live in the exact
`main.js` region that session is editing.

Checked and eliminated, so nobody re-chases: no tod double-download, no
boot-time leaderboard call, no fonts/analytics/service worker, corrupt
localStorage cannot brick boot, and re-encoding the art is off the table
(WebP q85 visibly damages the dither — measured).


### The spare portrait left the boot — 541 KB lighter, invisible

Client, on the intro layers: *"we killed the transition of those... how can
we lighten this up?"* The re-encode suite's free lane, shipped:
`title-portrait.webp` had two jobs left — the dim loading backdrop and the
7px eye-pupil source — and both source from `title_noopts` (the plate the
player actually sees) now. Measured before cutting: the two files' eye
patches differ ≤24 levels on pupils drawn at half scale. The import itself
had to go (an asset import ships the file even unused); the `title_base`
key fallbacks stay so its absence can never throw. Title wait: 3.78 →
3.25 MB. Eyes verified tracking after (10% gaze-region change between
cursor extremes). NOT cut, deliberately: the sign/hero/pole card files
(~121 KB) still drive the settled screen's sway — the signs breathe;
killing them buys pocket change and a static painting. The sign FLY-IN
question is settled separately: it died 08-14 in `5aca0cd` as a side effect
of background-first (the bare plate carries the furniture painted, flying
cards would double-print), the client says painting-first was all he
wanted, and the fly-in stays gone. Suite green: titleshells 15, titlefit
48, titlehome 176, titleintro 12, barescars 8, introorder 4, deferboot 12.

### Dash is safe passage, the dev doors are off the prize board, and links unfurl

Three from one review round of an outside patch spec (client-supplied,
reverse-engineered from the minified bundle — several of its claims were
stale; these were the real ones, two of them reshaped by the client's own
word):

**Dash passes through enemies.** Client, overruling the spec's dash-kill
proposal: *"as long as dashing doesn't hurt me, I will keep dashing — just
being able to dash past enemies, instead of having to kill them."* Audited
first: there were NEVER dash i-frames — the contact branch ignored
`dashing` entirely, which is why dashing into an enemy always cost a heart.
One check in `enemy.js resolveEnemyCollision`, after the stomp box (a
dashing descent that reads as a stomp is still a stomp), before the damage
roll. The enemy lives; no score, no bounce, no air-jump refund — the stomp
keeps the kill as the higher-skill verb. `tools/harness/dashpass.mjs`
grades both sides (5 checks; its own first version called the working stomp
broken by sampling vy fifteen gravity ticks after the bounce — minimum-
tracking fixed the instrument, not the game).

**`?relay=1` and `?stage=N` runs no longer submit.** `lbSubmit` fired
unconditionally on completion, so a relay bag-farm (no enemies, no pit
deaths) would have landed on a board with a real prize on it. Gated in
`nextStage`: submit only when the run began at stage one with the full game
on; the doors stay fully playable and the local on-device bank stays
unconditional. `tools/harness/relayboard.mjs` (3 checks × 3 runs): relay
run → 0 submits, mid-game start → 0, plain run → exactly 1.

**Shared links unfurl now.** `index.html` had zero og:/twitter: tags — a
pasted link rendered blank in every messenger, in a share-driven contest.
Full card set added; the image is a 1200×630 band cut from the title
painting at `public/share-card.jpg` (un-hashed, stable URL — crawlers
cannot run JS). Copy avoids naming contest dates (still blocked on Will
Hill's team).

**And the PWA bottom band is instrumented, not guessed at a fourth time.**
The client's screenshot shows a 59pt black band below the painting and
clipped button feet — on a build whose CSS calc AND standalone stretch are
both live, so the box was measured before iOS settled its geometry.
resize() now re-runs on a short schedule (300ms/1.2s/3s) and after
orientationchange; and `?probe=1` (URL-only dev door) overlays every number
the sizing chain reads — innerHeight, visualViewport, CSS box, bitmap,
screen, env insets, standalone — so his next screenshot IS the diagnosis if
the re-measure alone doesn't close it.

### START is a button now — tap-anywhere is dead, at the client's reversal

Client, from his phone: *"I can still tap anywhere and start the game. I
thought we removed that."* What was removed back then was the black TAP
ANYWHERE card; press-anywhere-starts had deliberately outlived it ("PRESS
START means press anywhere," his instruction of that day). His new word
supersedes it: the run now starts ONLY from his painted PRESS START
lettering (`title.hitPrompt`, 24px slop — the most generous of the four
controls since the sky above it is free and OPTIONS/banner/dead-band are
hit-tested first). A tap on open art does nothing except the free audio
unlock. Keyboard Space/Enter is unchanged. The intro skip rides the same
target — a tap on the prompt's position mid-assembly still starts, open art
mid-assembly no longer does. Seven harnesses that tapped open art to start
runs were moved to the prompt in the same commit (startchain — which every
flow harness rides — plus direct taps in relaytod, titleintro, panelnav,
musiccheck, startflow, optionsmenu); `relaytod`'s "open space is START"
check is INVERTED to grade the new rule both ways.

**And the PWA bottom, measured, is fine**: `titleshells` now simulates the
home-indicator strip (`__safeBottomOverride: 34`) and the control block's
foot clears the usable screen by 8px on the PWA geometry — the earlier
homeLayout inset fix holds. 15 checks × 3 runs across five geometries.

### Safari and the PWA finally frame the same painting — the clouds show in both

Client, with a photo of each shell: *"we need to find some middle ground so
both of them... I've worked hard on them clouds bro and that's not showing
up on the web browser."* The installed app was already correct; Safari (and
every short browser viewport) cropped the title plate to the wordmark's
exact ink row — 0-1px of sky, photographing as a clipped title. The cause
was deliberate history: the fit's top margin was zeroed back when PRESS
START was PAINTED at a fixed source row and an iPhone SE landed the drawn
controls on his lettering. Both premises have since expired — the whole
control block is drawn from the screen's bottom inset now, and the client
overruled "sky is expendable." Fix in `stillscene.js` fit(): the top keeps
`min(leftover budget, 110 rows)` — leftover-funded, so when the crop needs
the whole budget nothing changes (the SE guarantee is intact by
construction) and the already-correct PWA is untouched. Measured after:
PWA 84px of sky (unchanged), Safari 39px, ~830-shells 56px, SE 21px, Pixel
54px — clouds in every shell, wordmark clear of the top in every shell.
New harness `tools/harness/titleshells.mjs` grades all five geometries from
pixels (10 checks × 3 runs); titlefit 48, titlehome 176, titleintro 12,
barescars 8, optionsmenu 31, entryfit 44 all green on top of it.

### The soundtrack is warm before its screen asks — and the worker stops burning its own cache

Client, at Little 5 Points with the music arriving late: *"music that I
worked hard to have come on immediately now is delaying... everything needs
to be ready on my game even if it cost me a little bit of load upfront."*
Two real causes, both fixed:

**1. Stage cues were NEVER prefetched.** Every cue element is built
`preload='none'` (deliberate — ten tracks must not race the boot), so a
cue's download started the moment its screen first asked. Only the MAP cue
got `warm()` (at 55% of a stage); the stage tracks fetched at stage entry,
late on any cold cache. Now `backgroundLoad()` warms the whole soundtrack
behind the art — stage one's cues the moment a run is possible, the other
seven staggered 900ms apart once the images are done (decodes never stack
past music.js's own 2-buffer cap). `warm()` grew one guard in the same
commit: never `el.load()` the cue that is playing — load() RESETS a media
element and would cut the soundtrack mid-note.

**2. The service worker burned its whole cache on every deploy.** The cache
NAME embedded the build id, and activate deletes every other-named cache —
so each of the 13 deploys across 08-18/19 threw away every unchanged plate
and song and re-fetched ~21 MB. That is why music that had been instant
went cold repeatedly. The cache is one stable name now (`wh-p1-static`);
the per-entry purge already evicts exactly the files a new build dropped,
which is the only eviction hashed names ever needed.

Graded: `deferboot.mjs` B4 (all ten cues warmed on dev, read from
`music.status().warmed`) and C3 (all ten fetched on the hashed prod build
with no gesture), ×3 runs; full music suite green (musicbox, loopseam,
endcue, musiccheck, graphwire, pausemenu).

### The title shows on its own art — the load went from one wait to none

Client, after watching a fresh visit take ~5 seconds to the title: *"I don't
wanna see loading. Period."* Second cut, same day as the deferral below: the
title no longer waits for ANY of the game behind it. Boot pass 1 (the title's
own ~3 MB) puts the full title screen up; REST (sprites, props, stage one,
the ending) loads while the player reads it, and the one canvas exit from
the title — `startRun()` — holds on the LOADING card in the rare case a tap
beats it, released by `update()` the moment the art lands. Audited first: on
canvas the title reads only its own keys; the contest form, OPTIONS and HOW
TO PLAY are DOM and fetch their own files. If the run hold's loader FAILS
three consecutive flights, it escalates to the `bootError` card (RETRY,
cache-busted) — the standing rule that no failure may present as eternal
LOADING now covers the hold itself. `booterror.mjs` was updated in the same
commit: a dead sprite no longer kills the boot (the title coming up is now a
graded improvement), and the red card is graded where it now appears — after
START. Why the game "never loaded like that before": the wait was always
there but INVISIBLE — `de5c3f2` (08-15) started the loop before the load, so
the LOADING card was seen for the first time; before that the same seconds
were a black page. Then 08-18's ten deploys re-hashed 3.86 MB of assets and
invalidated phones' caches over and over (docs/LESSONS.md #25). The game
never got heavier: 20.69 MB imported at the first commit, 21.58 MB now.

### First-load deferral — the boot buys the title and stage one

Client: *"My goal is to have an instant load every visit."* The first-visit
half (the worker cannot help a first-ever visit): the boot manifest now
carries the title, sprites, props, ending art and **stage one only**; stages
2-4 and the MARTA map (~2.2 MB of the 9.6 MB boot) fetch behind the title
via `loadLate()` — idempotent, self-retrying (3s cooldown), and guarded so a
time-of-day swap mid-flight discards the stale half instead of landing it.
The `?stage=` dev flag's target rides along in the boot set, so the flag
still works. The safety is the **platform hold**: update()'s `riding` branch
gates `startStage` on `stageArtReady()` + the map, pinning the ride at full
progress and keeping the retry warm rather than entering a stage backdrop.js
would draw bare. `__startStage` is deferral-aware for the harnesses. The
repeat-visit half is the service worker already live: it caches the
background fetches as they land, so visit two serves everything from cache.
Graded by `tools/harness/deferboot.mjs` — 9 checks × 3 runs: title boots
with stage-2 art unreachable, ride holds then releases on unblock, and
boot-before-late request order proven on dev AND the hashed prod build.

### The L5P seam was two corrupt pixels, not a repeat problem

Client, long ago: *"that should be the first seam of the bg where it repeats."*
`seamsweep` has carried it as the worst number in the suite ever since — L5P's
plate join at a **194.1 step, 7.29x that frame's own p99, on 26 of 100 frames.**

It was never a repeat problem. `l5p-base` opened with two columns at luma
**251.6 and 142.4** in front of a plate whose next column is 5.0 — a white line
down every row, printed again at every plate width. `edgewood-base` had one at
its right edge. A resampling artifact at the frame border, and
`tools/fix_seam.py` was written for exactly it, documents it in its own header,
and **had never been run on these two plates.**

`--repair` clamps the first good column outward — no crop, so plate width and
every `span` / `xRanges` / `light.x` fraction stays valid.

| | before | after |
|---|---|---|
| `l5p-base` seam ratio | 37.2 | **0.6** |
| `edgewood-base` seam ratio | 9.8 | **0.5** |
| `seamsweep` L5P worst join step | 194.1 | **6.0** |
| `seamsweep` L5P median join | 190.8 | **3.7** |
| `seamsweep` edgewood worst join | 26.2 | **9.8** |
| worst edge anywhere in the sweep | 194.1 | **29.9** |

Every stage's join now sits below its own frame's p99 — quieter than the
painted detail around it. Underground's own join (13.6) was never the target
and did not move.

### The Underground doubling — one number that was never wired up

Client, with four phone captures: *"It's always underground with double shit in
there in the background double pose double building and all the issues day and
night."* Then: *"Buildings and buildings clouds and buildings we gotta fix this
man. We are almost done with the game."*

Three complaints, one cause. `src/render/backdrop.js` has read
`bg.separation` per stage since `ca206e4`, defaulting to 16px, and the comment
in that same commit says *"Underground takes 4"* — **and no stage ever declared
it.** `git log -S separation -- src/world/stages.js` returned nothing, ever. The
stage of signs ran at the 16px cap its whole life.

Measured off the live game at 82% of the stage, before → after:

| card | before | after | what it is on screen |
|---|---|---|---|
| `towers` | −15.3px | **0.0** | the downtown skyline, doubled |
| `backdrop` | −14.9px | **0.0** | doubled |
| `leftblock` | −14.1px | **0.0** | doubled |
| `furniture` | +13.0px | **+4.0** | bins, boxes, parked cars |
| `lamps` | +13.4px | **+4.0** | "double pose" — the lampposts |

Ten values in `src/world/stages.js` and no plate pixel touched:

- `separation: 4` on **both** Underground `bg` blocks — `?tod=day` replaces
  `bg` wholesale, so it has to be stated twice.
- `towers` / `backdrop` / `leftblock` → `depth: 0.50`, night and day. They kept
  their place in the array, which is what occludes the weather. They had all
  saturated the clamp within 1.2px of each other, so there was no parallax
  between them to lose.
- Night `trees` → `0.50` and its third sway band dropped: the day half had this
  fix and the night half never got it, under a comment describing both as done.
- `edgewood-day` `skyline` → `0.50`, same fault, 4,073px of cloud overlap.

Shown to him as a four-panel day/night before/after at the same camera: three
lamp heads become two, the street sign stops reading twice, the towers resolve
to one each, PEACHTREE loses its ghost P.

**Why no harness caught it:** `cloudseal.mjs` measured at spawn only, and card
separation is `camX * (depth - BASE_DEPTH) * DEPTH_SPREAD` — zero there by
construction. It travels five positions now. See `docs/LESSONS.md` 27–30 and
`docs/NEXT_CHAT.md` §6 faults D and E.

⚠️ **Two leaks the travelled harness found on stages nobody reported**, both
pre-existing and carried as a named ratchet in the harness: `eav` 104px at
11,290m-in and `l5p` 115px at 7,200. eav's does NOT respond to this fix
(measured: with `separation: 4` on all four stages it went 104 → 142) so it is
a different fault and is undiagnosed. Separately, `seamsweep` has always
reported **l5p's plate join at a 194.1 step, 7.29x that frame's own p99, on 26
of 100 frames** — the worst number in that harness by a factor of fourteen, and
untouched.


### Audio, settings and scores — the day he tested it live (`fa72781` … `b1a9dec`)

Eight commits, all confirmed by him on the device: *"Everything plays well.
Settings works smoothly."*

- **A looping cue plays from a decoded buffer, not a media element.** He cut
  the intro himself at the bench, heard it in the game and said *"at the end of
  the loop it's a pause before the loop starts again — the loop is perfect."*
  He was comparing against `tools/loopbench.html` and comparing fairly: the
  bench uses `AudioBufferSourceNode` with `loopStart`/`loopEnd`, sample-accurate
  and butt-joined, while the game crossed two `<audio>` elements over **`LAP =
  0.9` seconds** — most of a second of bar 16 playing over bar 1, every wrap.
  Correct for a loop point nobody had listened to, where the raw join is 13x or
  104x; wrong for one he cut to be exact. Measured after: laps 0, zero silent
  frames, one cue audible at a time. It also removes the MP3 container padding
  a native element loop wraps through, and deletes the iOS failure path
  entirely — there is no second element left to refuse.
  ⚠️ **The element path stays as the fallback** and engages whenever the
  context is asleep or a decode has not landed. Two buffers are held at once
  (playing + warmed); a decoded stage track is ~35MB of Float32.
- **Two bugs of mine on the way, both caught by measurement, both worth
  remembering.** Promotion carried the element's gain across to avoid a jump
  and shipped audible music with the sound OFF — a muted element is *paused*,
  so its gain can sit at full level and still be silent; copy that onto a
  buffer, which has no pause, and it plays (bus 0.194). Then the "assertion" I
  added to setMuted cancelled the very ramp-to-zero the line above scheduled,
  so muting left it at full volume (bus 0.482). `levelOf()` is now the only
  thing allowed to decide a level, and nothing may touch the gain in setMuted.
- **Changing a setting no longer restarts the game.** *"Setting the time and
  settings shouldn't restart the whole damn game man… it shouldn't stop the
  music."* TIME OF DAY called `location.reload()`; the comment defending it
  argued the live re-resolve was a lot of machinery, which was true and beside
  the point. It turned out small: nothing outside `main.js` imports `STAGES`,
  nothing imports `TIME_OF_DAY`, every renderer reads `stage.tod` off the
  object it is handed. Load first, swap second, both halves valid throughout.
- **The intro is his own cut: 16 bars at 134 BPM from hook 57.132.** He set it
  at the bench, then heard *"a little is missing from the first beat, maybe a
  few hundred ms off"* — right again, and measurable: his 57.309 sat 182ms past
  the strong onset and 46ms short of the next, in the GAP between two hits and
  off the 8th-note grid, so the loop opened in a dip with the run-up cut away.
  The hook moved back 177ms. `CHOSEN_BARS` in `cut_loop.py` is the mechanism
  that stops the search overruling him, and a cue he picked **ships with no
  crossfade** — on his cut it measured slightly worse (1.38x vs 1.36x) while
  rewriting his first 15ms with audio from bar 17.
- **No login, and a score is never lost.** *"They never have to login again…
  it keeps up with all the scores… before they answer the contest it should
  keep all of this shit on local storage."* There was never a login. What was
  broken: `pendingRuns` lived in a variable, so runs finished before
  registering died with the tab; and a failed submit was discarded AND marked
  sent. It is a persisted outbox now (`wh_pending_runs` / `wh_sent_runs`) and a
  run leaves only on a 2xx, retrying on registration, the next run, reconnect,
  or the next visit.
- **Verification.** `outbox` (new, 13) reads the queue out of localStorage
  rather than trusting the module, and its break-test wipes the key to prove
  the survives-a-reload check can fail. `todlive` (new, 12) drives the real
  `#sTod` — `relaytod` could never see this, because it flips the setting by
  writing localStorage and calling reload() itself. `loopbench` grew to 32.
  `loopseam` was **reframed, not deleted**: grading "a lap happened" would now
  grade the absence of the fix, so it grades what the lap existed FOR.
  musicbox 11, endcue 11, loopseam 9, pausemenu 13, relaytod 26, share 12.

### Atlanta time everywhere, and a bench for his own ear (`4afd00e` … `4ef9eab`)

- **The game runs on Atlanta's clock, for everyone, everywhere.** *"The goal
  was to bring Atlanta to the world… if I'm in Australia and I'm playing this
  game, the time it is in Atlanta needs to be the time it is in this game."*
  The default was the device clock; it is now Eastern. `atlantaHour()` /
  `isNightInAtlanta()` in `src/world/stages.js` ask `Intl` for the hour in
  `America/New_York` rather than subtracting an offset, so daylight saving is
  the platform's tz database's problem and there is no March/November bug
  waiting. No `Intl` falls back to the device clock rather than throwing.
- **The setting keeps every option, renamed honestly.** TIME OF DAY is now
  `Atlanta time` (default) / `Always day` / `Always night` / `My local time`.
  The old stored `'auto'` maps to `'local'` in **both** `panel.js` and
  `timeOfDay()` — they must agree or the dropdown would say one thing while
  the sky did another. The note names the hour it is in Atlanta right now, so
  a player abroad sees why the streets are dark at noon.
- **`tools/loopbench.html` — he trims the loops himself.** *"What would be
  cool if you created a bench for me to trim each track to the perfect loop
  with a little millisecond slider… if you put the wave files from each track
  there."* Live at `/bench/`. Five cues (the four gameplay stages plus the
  intro), waveform with the trim region shaded, ms nudges, bar/beat snapping,
  `LOOP THE JOIN` playing the wrap sample-accurately from 4s out, and an A/B
  against what ships today. **It finds numbers; `cut_loop.py` still makes the
  cut**, so the loudness match, the crossfade and the five gates stay in force.
- **The bench serves the SHIPPED loops, not his masters.** The first design
  rendered fresh clips from the originals — 96-148s of each unreleased
  instrumental on a public URL against the 66-102s already there. The shipped
  cuts are the same bytes the CDN already serves and are what the game
  actually sounds like. Cost, stated per cue in the interface: a shipped loop
  can be trimmed but not extended. `--master <slot>` re-renders one cue when a
  longer loop is wanted, opt-in and one at a time.
- **Bench time is loop time.** `cut_loop.py` cuts so the hook IS the start, so
  zero on the page is the loop point and the END reads out the new length
  directly. The copied JSON still reports `hook` in ORIGINAL-file coordinates.
  A number meaning something different from what is being heard is the only
  way this tool could quietly cause a wrong cut, so it is designed out.
- **Verification.** `loopbench` (new, 21) reads the real state through
  `window.__bench` — the buffer actually handed to the audio graph, never a
  recomputation that would agree with itself. It pins the crossfade to
  `crossfade_wrap()`'s own formula sample-for-sample (worst error 2.7e-8). Its
  break-test unticks the real checkbox and **re-runs the sample-exact checks
  against that state**, which go red (head error 1.0e-1). `relaytod` 26 PASS
  after the clock change. Both deploys confirmed on the CDN.
- **Still open here:** the 2-bar duplication at the end of stage one is
  diagnosed (the first 1.5s returns at 62.895s, correlation 0.889 → 38 bars,
  62.897s) but **not cut** — his ear decides on the bench first. Tempos for
  `salvador_knowledge`, `strange_girl` and `knowledge_x_polo` are detector
  guesses and flagged as such; he knows the real ones.

### The title screen, twice over (`2bb29ef`, `eceb8b1`) — both from live photos

- **The intro's sky scars are gone.** He caught the beat before the lettering
  lands: *"can we do something about the scars and the sky before the text for
  Will Hill falls in place."* It was `title-portrait-bare.webp`, the
  intro-only plate — its letter-shaped holes were filled with per-row strips
  and then blurred, in a sky `cut_title_clouds.py` had already proved is
  textured. Two defects, both measured: the fill carried **half** the
  painting's texture (0.436 against 0.885–0.916 beside it) and the mask left
  the letters' shadow behind — the ring 2px outside it is **7.69 levels darker
  than the same row's sky**, a letter-shaped ghost in its own right.
  `tools/cut_title_bare.py` now takes the halo with the letters (`HALO_GROW`
  5, gated to stay in open sky) and fills with 24px band donors from open sky
  only — **zero** pyramid pixels. Written asset: seam **0.75** where untouched
  sky neighbours differ by 0.86, texture **0.975** of clean sky. Also fixed a
  `gradient_fix()` that had been a **no-op since it was written** (it measured
  its error on pixels the fill never wrote). Five gates now refuse `--write`,
  and `--measure` re-scores the shipped asset: the old one FAILS, this one
  passes.
- **The painting reaches the bottom of the installed app.** *"There is a black
  space at the bottom of the pwa… can we bring the image down some to cover
  that?"* Moving the image could never have covered it — the ~33px strip is
  the home-indicator inset, and it was OUTSIDE the canvas: `#game` was an
  in-flow `100dvh` block whose box stops at the safe-area line, so what showed
  was `body`'s own background. Three changes that only work together: the
  canvas is fixed and full-bleed at `calc(100dvh + env(safe-area-inset-bottom))`;
  `resize()` sizes the bitmap from the element's box, not `visualViewport` (or
  the painting would stretch 4%); and the cover fit scales on **both** axes
  with `dy` clamped so no canvas row sits above the plate's top or below its
  bottom — width-anchored cover drew 929.6px on a 932px canvas, which would
  have moved his band from the foot to the crown.
- **Verification.** `barescars` (new, 8) grades the running page at intro ticks
  30 and 90 on two metrics, because energy alone cannot see a ghost — the old
  plate scored 2.0× the belt's energy on the wordmark and passed. `titlefit`
  grew 60 → 76 with head/foot checks and a break-test that reopens the band.
  Both break-tested red against the previous build. Eleven harnesses re-run
  green, since the canvas change touches every screen.

### Touch, the ride's music, and the loop points (`df862be`, `e0551f7`, `3ca8626`, `cf9d4dc`)

- **A pad you slide off no longer sticks.** *"Sometimes when I'm moving, the
  directional pad button gets stuck… sometimes it shows like the preview zone
  as if I'm about to zoom in on it."* Movement pointers are deliberately never
  captured (capture broke sliding between pads), so a thumb that drifts onto
  the canvas and lifts there sent its `pointerup` to the canvas and `#touch`
  never heard it. Window-level release **keyed to `e.pointerId`** — the older
  version cleared every pad and broke multi-touch, which is why it had been
  removed — plus `touchend`/`touchcancel` when no touches remain, for the iOS
  paths that send no pointer event. Callout/selection suppression is now stated
  on the pads themselves rather than inherited.
- **The map music was downloading, not late.** The cue was already asked for on
  the crossing frame; `preload='none'` made the finish line the start of its
  *fetch*. `music.warm()` prefetches at 55% of the stage. Verified false at
  30%, true at 60%, file pulled before the line.
- **Loop points cut on his tempo, chosen by the audible join.** He supplied
  174 (`lonliness_2`) and 145 (`doggzzz`); both verified against onset
  autocorrelation. `ncc` proved to be the wrong selector — it picked a 44-bar
  `ui_pause` measuring 3.05× the track's own typical splice. Scoring the wrap
  itself: **stage_04 2.46× → 1.37×**, **ui_pause 3.14× → 1.17×**. His hook
  offsets kept, as he chose. `stage_01` is the worst remaining at 3.36× and
  needs its BPM from him.
- **The installed app's foot.** Two CSS attempts each moved the painting and
  neither closed it, so `resize()` now measures the shortfall against
  `screen.height` and grows the box when standalone, full-width, and short by
  an inset-sized amount. The page background is also the plate's own bottom
  edge now — measured RGB (8,10,11) against the old (10,8,16) — so any residual
  strip reads as wet street, not a bar. **Still needs his confirmation from the
  home-screen app**: Chromium cannot launch as an installed iOS app, so the
  emulated case (898px web view on a 932px screen → grows to 932, zero
  uncovered rows) is the strongest proof available here.
- **The wind was left exactly as it is**, at his instruction. `audio.js` has
  zero diff this session.

### The contest backend (`0489ce9`) — the most load-bearing work here
- **Moved off Cloudflare KV onto D1.** The board was one KV key doing
  read-modify-write. KV has no compare-and-swap, so two players finishing at
  the same moment meant the second write erased the first — a lost score with a
  prize attached — and KV's ~1 write/sec/key ceiling made a launch party a
  queue. Now an atomic upsert: `score = MAX(runs.score, excluded.score)`.
- **Read path split from write path.** `/top` cached 2s at the edge, `/submit`
  never. A hundred players make a hundred writes and thousands of reads.
- **⚠️ Fixed: entering the contest AFTER a run used to LOSE that run.**
  `lbSubmit()` returned early when unregistered and the submit fires at the
  moment of death, before the panel offers the contest. Held in `pendingRun`
  now and flushed by `flushPendingRun()` the instant they enter.
- **Hardening:** CORS pinned (was `*` — any site could enter the contest),
  replay run-ids with the `seen_runs` primary key as the lock, two honeypots
  (hidden form field + decoy `score` field), plausibility limits above the
  score recompute, fail-closed errors (it was returning raw exception text),
  and every refusal logged with a reason.
- **Dashboard** — `cloudflare/dashboard-worker.js`, its own worker on its own
  hostname, read-only on the same database. Rotatable token in the link, no
  login. Every entrant with score/phone/email/plays, live, top-N isolation,
  CSV export.

### Backgrounds
- **Clouds pass behind buildings on all four day stages** (`d6c9a69`) and on
  the title (`a075648`). Measured in the running game: 0px of cloud on any
  building, down from 1,259px on the Underground.
- **`drawFeather` moved after the cards**, so the plate's top crop line
  dissolves for the whole backdrop instead of the base alone. Improved every
  stage: day 57.7→2.9, 37.1→1.9, 69.1→2.2, 22.6→1.7; night all under 2.2.

### UX
- **The home page has real buttons, and a way straight into the contest**
  (`7e2e493`, `cec447e`). Client: *"I'm not really comfortable with how start
  game, options and music buttons are sitting. And also, from that page, I want
  someone to be able to immediately enter the contest."* Both had one cause —
  the controls were anchored to the PAINTING (OPTIONS was his painted word at
  source row 1609 of 1844), so where they landed depended entirely on how the
  cover-crop fell: 12–14px tall on every phone measured, and simultaneously
  bunched high with 73–82px of dead pavement underneath on a tall one and
  crushed against the bottom edge with a 6px gap on an SE. `homeLayout()` lays
  them out from the SCREEN instead — 44px targets, ENTER THE CONTEST as a
  highway-sign banner across the pavement with OPTIONS and MUSIC in a row
  beneath it, a one-row fallback at 34px where the road runs out, and a clamp
  so nothing ever reaches PRESS START. PRESS START stays painted; that was his
  call. Registered players get YOU'RE IN · SEE THE BOARD instead, and both
  routes use a new `flow: 'title'` so NOT NOW and BACK land back on the home
  page. ⚠️ The painted word lived in THREE files, not one — see LESSONS.
- **The leaderboard IS the ticket** (`1e8e894`, fixed `55075d2`). No plate, no
  border, no padding, no duplicate heading; BACK moved onto the cream footer
  beside ENTER. 259×561 → 336×904 on a 430px phone, zero overflow.
- **Movement pads lifted and solidified** (`ae8090c`) — 18→34px, face 0.52→0.80
  alpha, gold edge 0.34→0.58. Nav pair only; JUMP and DASH untouched.

### Sound
- **The ending music starts at the last finish line** (`527dc1f`), not at the
  tap. Cross stage four's line and the credits are already running behind the
  clear card. Matches the map-music rule already shipped.

### Tooling
- **`docs/TESTING.md`** — the test section he asked for as CAT 6.
- **New harnesses:** `endcue` `entrypaths` `introorder` `padlift` `stageflag`
  `stagesweep` `titlehome`.
- **`cut_title_options_out.py`** paints his OPTIONS off every plate that
  carries it and has an `--audit` that reports the band's contrast for every
  plate-shaped asset in `src/assets/backgrounds/` — because "the plate is
  clean" was true and the word was still on screen.
- **`stagesweep.mjs`** sweeps every screen of every stage, day and night, at
  identical camera positions — 27/30/32/34 screens — for background review.

---

## NOT DONE — the live queue

### CAT 1 — Backgrounds ✅ *all three items closed*
⚠️ **This list used to say all three were open and waiting on his markup. They
are done; the entries are kept so nobody re-opens them.**
- ✅ **Layering blemishes / the Underground doubling.** Root cause found:
  `bg.separation` existed in the renderer since `ca206e4` and **no stage ever
  declared it**, so the stage made of signage ran at the 16px default. Fixed in
  `4a1d0cc` — `separation: 4` on both Underground `bg` blocks, and the three
  far cards to `BASE_DEPTH`. Measured at the far end: towers −15.3 → **0**,
  lamps +13.4 → **+4.0**. Shown to him as a day/night before-after.
- ✅ **"The layers on the Underground appear to be gone."** Answered by the
  same measurement — the cards were all present and all *saturating the clamp
  within 1.2px of each other*, which is a set with no parallax between its
  members. That is why it read as flat AND as doubled at the same time.
- ✅ **Wrap seams.** Not a repeat problem at all: two corrupt columns at the
  left edge of `l5p-base` (luma 251.6 and 142.4 against a next column of 5.0),
  one at `edgewood-base`'s right edge. `tools/fix_seam.py --repair`, which had
  never been run on those plates. `seamsweep` L5P worst join **194.1 → 6.0**.
  Fixed in `323f812`.
- ⚠️ **One thing still open, and it is small:** `cloudseal` carries a named
  `ALLOW` ratchet for 104px on `eav` and 115px on `l5p`. Diagnosed as far as
  "a hole in the seal, not any card's parallax" (it survives muting every
  card). Closing it needs `scrub_stage_clouds.py`, which needs scipy.

### CAT 2 — Movement ✅ shipped, and the clouds now read on every day stage
Drifting clouds on the title and all four day stages — `eav-day`,
`edgewood-day`, `l5p-day` at `drift: -0.035`, `underground-day` at `-0.030`.

✅ **EAV AT NIGHT NOW MOVES.** This section used to say "night stages have no
cloud cards at all", which was false: `stages.js:283` gives EAV at night the
only night cloud card in the game, and it had no `drift` — the one set of
clouds in this project that sat dead still. Fixed.

✅ **EAV BY DAY HAD NO CLOUDS FOR THE FIRST HALF OF THE STAGE.** Measured with
`cloudseal`'s own `painted` count: **0px at every tick at spawn**, 70-316 at
25%, and only then 8,789 by 75%. Its puffs covered 25% of the plate's columns
and all of them were at the far end. `tools/spread_clouds.py` repeats the
stage's OWN puffs across the empty width — his paint, flipped and jittered,
nothing invented — taking it to 70%. Spawn now reads 71-1,028px at every tick.

✅ **NOW APPLIED TO ALL THREE STAGES THAT NEEDED IT** (edgewood always had
even coverage). What unblocked it was the seal, not the spread: the seal's
card-footprint exclusion had produced four distinct leak bugs and is GONE —
"seal the whole band and trust nothing," the skill's own sentence, taken
literally — and the bright-unsaturated exclusion is size-floored at 300px so
lit ledges stop reading as baked clouds. With that, three consecutive full
cloudseal runs hold at **eav 27-29, edgewood 0, underground 0, l5p 12-22,
with the ALLOW debt table deleted** — the first time the suite has been green
with no allowances at all. The music-duration table is also fixed (it was
grading the client's approved 08-16 re-cuts against a hardcoded 08-13 plan;
expected durations now live in `tools/cue_sheet.json` and the harness reads
the sheet — all ten match).

| stage | cloud px | column cover | spread? |
|---|---|---|---|
| `eav-day` | 11,136 → 31,059 | 25% → **70%** | ✅ |
| `underground-day` | 16,824 → 40,665 | 32% → **86%** | ✅ |
| `l5p-day` | 2,946 → 7,574 | 26% → **67%** | ✅ |
| `edgewood-day` | 6,574 | 36% | not needed |

⚠️ **DO NOT HAND-ROLL THE MEASUREMENT.** `cloudseal.mjs` computes "how much
cloud is on screen" with a three-sample noise floor, an erosion pass, a blob
floor and a camera-stability gate, at five camera positions. Two ad-hoc
attempts at the same number in one session both came back contaminated. And
**run it three times** — see LESSONS 29/30 and 34.

### CAT 3 — Sound ✅ shipped
- ✅ Ending music starts sooner.
- ✅ **Loop-seam crossfade** (`6d649c8`). Every looping cue laps two elements:
  0.9s before the end the spare starts at zero, the pair cross, and they swap
  at the seam. Native loop stays on both elements as the safety net, so no
  graph / no gesture / a missed lap all degrade to exactly the old behaviour.
  `loopseam` 5 PASS off the master bus, with a `window.__lapOff` break-test
  proving the lap is what carries the seam. Longer masters from him remain
  welcome but are no longer load-bearing.

### CAT 4 — UX ✅ shipped
- ✅ **HOW TO PLAY is the four-page swipe card he specified** (`4d0bdb6`):
  ✕ image, ✓ image, ✕ text, ✓ text per page, CSS scroll-snap, dots,
  tap-paging. The champagne lesson is a real pair now — the ✓ frame shot with
  the aura lit, bags grown and blue, and BOTH the shooter and `howpage.mjs`
  measure the blue difference before it may ship (✕ 9.3 vs ✓ 35.7 in the
  bluest 1% where the bags are). 10 PASS.
- ✅ **SHARE says MAKING YOUR CARD… while it encodes** and refuses a second
  tap; restored in `finally`.

### The Underground "layers gone" question — MEASURED, not a bug
Per-card parallax over 4000 world px: Underground spread **17.3px**, EAV (his
reference for "good") **16.4px**, every card at its own rate in correct depth
order (columns +8.5 … spire −8.3). The multiplane is alive and structurally
identical to the stage he is happy with. What changed is `4bf6d10`: the
fence-doubling fix clamped the whole deck 90px → 16px, so the pronounced
trashcan-era slide he remembers went away as the COST of killing the doubled
fence he photographed. If he wants more read, the dial is MAX_SEPARATION —
but 34px was a photographed bug, so that trade needs his eyes, not a quiet
revert.

### CAT 5 — Sign-up ✅ shipped, and now a CARD rather than a machine
Offered before a run and after death — **every start until they actually
enter**, not once — and the run reaches the board either way, which it did not
before.

His ENTER CONTEST cabinet was 853x1844 and covered the phone. It is cropped to
**853x992** at a black rule he painted (`tools/crop_entry_plate.py`) and laid
over whatever view the panel is showing: HOW TO PLAY before a run, the board
after one, per *"an overlay over how to play."* All three of his painted ways
out just dismiss it, and what they reveal is where the player was going anyway.

The crop takes his gold ENTER disc with it, so SAVE is the silver knob now,
carrying a green tick built out of his own red CANCEL button. LEADERBOARD and
RULES & PRIZES went below the cut and are gone, and NOT NOW already reaches the
board. ⚠️ **CONTEST INFO opens NOTHING as of `dad801d`** — it opened HOW TO
PLAY, which is not what its lettering says, and the client had it unwired until
there is real contest copy to point it at. That copy is blocked on Will Hill's
team, like the dates.

### CAT 9 — HOW TO PLAY is one page, and the pads render at last ✅ shipped
Four swiped pages with ~90 words became **one page**, laid out like the Jandé
instruction screen: a row list with a fixed visual column. His ✕/✓ frames all
stay — the pictures carry the lesson, so the copy is ~33 words total. Three
control rows lead it (Move / Jump / Dash), which no screen in the game had ever
taught, and the badges are the game's **own pads**.

Making them match found a live bug: `#tJump` and `#tDash` set `border-radius:
50%`, a blue scheme and a smaller font, and **none of it had ever applied** —
`#tJump` is (1,0,0) against `#touch .pad` at (1,1,0). JUMP had been a rounded
amber square, never a blue circle. Fixed the way `.move` already was. See
`docs/LESSONS.md`.

And the lesson shows **once**, not on every start — his call, closing a
question `NEXT_CHAT.md` had been holding.

### CAT 8 — The ending is his painting, whole ✅ shipped
He replaced the 1536x1024 landscape mockup with a **853x1843** SHOWTIME plate —
the same shape as the cabinet and the dashboard, so it covers a phone instead of
letterboxing more than half of it away. It carries its own title, its own eight
stat labels and its own RESTART button, and `src/render/ending.js` now draws
**nothing but eight numbers**.

The stat list took two passes: the plate first arrived with the standard
beat-em-up set (BOSSES DEFEATED, MAX COMBO), which this game cannot back, and he
relettered it rather than have his art repainted. Every word on the shipped
plate is his. RANK is gone with his say-so.

Flow, his words — *"Ending scene then Leaderboard and registration"*: the ending
plays, the board arrives over it on its own after the stats tally, and
dismissing it reveals his painting again with RESTART, which now genuinely
restarts. The crowd sway is a separate pass — *"ship it flat first"*.

### CAT 7 — The between-screens have buttons ✅ shipped
PM: *"let's add a score here"* and *"we're really not pressing jump to continue,
we're just tapping the screen."* STAGE CLEAR shows the score and a NEXT STAGE
button; GAME KNOCKED offers GET BACK UP and END RUN when a continue is left,
which removes a trap where JUMP spent one with no way to decline. Tap-anywhere
is gone. The ending keeps HIS painted PRESS START TO CONTINUE as its target —
and wiring that found a mapping bug that meant its glow had never once been on
screen (`docs/LESSONS.md` 21).

### CAT 6 — Test section ✅ shipped
`docs/TESTING.md`. Full suite green: **32 harnesses**, 458 checks, zero failures.

---

## UNDONE — tried, then removed
- **Blanking the MARTA card** to remove Will Hill's pinned score. Rejected:
  *"that blank leaderboard looks horrible… why can't you just remove his name
  and stop fucking with everything else."* Correct approach: build the ticket
  in CSS, never edit his card.
- **Intro three-beat ordering** (environment → objects → title). Blocked on a
  clean cut of the signs, hero and pole off the plate; the 23% inpaint came
  back smeared. `introorder.mjs` grades the ordering that DID ship — his name
  lands at tick 99, PLAYER ONE at 111.

---

## The database, as it actually stands

**Content: one real entry.** KCTW, 29,750, 4 plays. Everything else in there
has been load-test data, created and deleted the same day — verified back to
`runs 1 / entrants 1 / run_stats 2 / seen_runs 4` after each run, not assumed.

⚠️ **Two of those four plays have no stats row, permanently.** The old
supersede path deleted a `run_stats` row unconditionally when a better score
arrived, so the 29,750 run's stats went with it before the guard
(`AND score <= ?`) went in. Consequences, so nobody reads them as live bugs:

- HIGH SCORE, RUNS and CITIES are right — they read `runs`, the board table.
- BAGS COLLECTED, ENEMIES STOMPED, DEATHS, STAGE PROGRESSION and RUNS OVER TIME
  under-report by those two runs and always will. The data is gone.
- Every run submitted from now on is intact; the guard is live and verified in
  the deployed worker.

If he wants those tiles to read clean before the contest, the honest fix is to
empty the table and start the contest from zero — not to invent rows.

---

## The DEATHS tile, MAX COMBO, and the migration that must go first

**Committed, NOT deployed.** Both workers changed, and one of them cannot be
deployed until the database is migrated — see the warning at the bottom.

**Why.** He photographed the live dashboard: *"that three is just a little too
tall for the space it occupied, and generally speaking there's gonna be
multiple digits there — maybe millions of kills once this competition starts
... it does have to fit in that space, and maybe a six digit number needs to
be able to fit in that space also."*

He was reading a real defect off a single-digit number. The DEATHS tile is the
only place on his plate where four values share one panel with three painted
labels, so it is the only place with boxes narrow enough to tear: the total
had 111px and the three sub-numbers 63px each, against 268px or better
everywhere else. Rendered at contest scale the total came out `.237.89` with
both ends sheared and the three sub-numbers ran through each other.

- All four boxes widened into the room his own lettering leaves — total to
  118px (beside the word DEATHS, stopping 7px short of his D), the three to
  74px each, still centred on his labels at x500.5 / 587 / 667.5.
- Two new sizes on the type scale, `.vm` 2.45cqw and `.vt` 1.55cqw, both
  picked from arithmetic and not taste: this monospace advances 0.602em a
  character, so nine characters (`9,999,999`) come to 113px and 72px. Six
  digits — what he asked to fit — clear both with a third of the box spare.
  The 4% left over at nine digits is deliberate: his phone is Safari with its
  own metrics, and a box that passes at 99.9% in Chrome has measured nothing.
- The total stays 56% larger than the three it adds up, which is what he
  asked for: *"it could be larger than those numbers, but it does have to fit
  in that space."*

**MAX COMBO**, a fourth row in OTHER METRICS: *"underneath BAGS LOST I wanna
add MAX COMBO there, because I plan on working a combo system into the game."*

⚠️ **This is the only label on that page not drawn by him**, and it is worth
knowing why. The chips are cut out of his own pixels, the expanded table's
heading is a crop of his panel — the only other lettering the stylesheet puts
on screen is CLOSE, on an overlay that is not on his plate at all. OTHER
METRICS is his painting and there is nowhere to put a fourth row except on it.
So the label is his own type spec, measured rather than guessed: his labels
start at x443, their caps are 10px, and they advance 7.45px a character
(CHAMPAGNE BOTTLES is 17 chars over 125px, BAGS LOST 9 over 65 — 8 characters,
60px). That is a 12.4px face, 1.454cqw of his 853px plate. The row lands at
his own pitch (label inks y1317, 1343, 1370, so the fourth is y1394) and
clears the panel border at y1411 by 6px. **It is the last row that panel
holds** — a fifth would sit on the border.

**There is no combo system in the game yet, so it reads 0.** The contract both
tallies now agree on is one `combo` event per run carrying that run's best
chain in `n` — one event, not one per link, so a 200-stomp chain costs the log
one event instead of 200. Capped at 9,999 server-side; like every other column
in `run_stats` it is player-reported and is not evidence.

### ⚠️ The database must be migrated BEFORE the dashboard worker is deployed

`schema.sql` is `CREATE TABLE IF NOT EXISTS`, which does **nothing** to the
table that already holds his 29,750. Deploy the new dashboard worker without
migrating and its funnel query fails with `no such column: max_combo`, `/data`
500s, and the page goes blank.

```
bash tools/deploy_backend.sh              # macOS / Linux / Git Bash
.\tools\deploy_backend.ps1                # Windows PowerShell
```

**It needs no install.** `wrangler` was not on his machine and the script
stopped dead on it; the usual fix, `npm i -g wrangler`, then needs a NEW
terminal before PowerShell finds the command, which is a second dead end at
the same hour. So the script uses a global `wrangler` when there is one and
falls back to `npx --yes wrangler` when there is not — no install, no PATH
change, one download into the npm cache on first use. Node.js is the only real
prerequisite, and this repo already builds with Vite, so it is there.

The one thing it cannot do for him is authorise:

```
wrangler login          # or: npx wrangler login
```

It opens a browser — authorise the Cloudflare account that owns the contest.
The script names the right form of that command in its own error if the
database read comes back unauthorised.

⚠️ A global `wrangler` can also be visible to PowerShell and invisible to Git
Bash — npm puts global commands in `%APPDATA%\npm`, which PowerShell has on
PATH and Git Bash often does not. The `.ps1` bridges that PATH across before
it hands off, so if the script says wrangler is missing, it is missing.

⚠️ **He is on Windows PowerShell, where there is no `bash`** — this shipped as
bash only and died on the first real run with *"The term 'bash' is not
recognized"*. The `.ps1` is a locator, not a second implementation: it finds
the bash that Git for Windows bundles and runs the same tested script. A
PowerShell rewrite would be an unrun second copy of the refusal logic, and the
refusal path is the one part that only matters on the day it fires.

That is the whole backend deploy now, and it enforces the order rather than
asking anyone to remember it: it reads the LIVE schema, applies whatever in
`cloudflare/migrations/` has not landed, **reads the schema back to confirm
the column is really there**, and only then deploys — dashboard first
(read-only, so a mistake surfaces where only he is looking), then the game
worker. Any failure stops it before a single deploy, so the live workers and
the live schema never disagree. `--check` reports and changes nothing.

Its six paths were exercised against a stub `wrangler` before it shipped —
column missing, column present, migration failure, migration reporting
success while the column never appeared, "duplicate column name", and the
full happy path — because a script whose whole job is refusing to deploy has
to have been watched refusing.

By hand, if it is ever needed:

```
wrangler d1 execute will-hill-contest --remote \
  --file=cloudflare/migrations/001-max-combo.sql
```

Every existing row reads 0, which is correct — nothing emitted a combo event
when those runs were played.

### STAGE PROGRESSION — measured, reported, then fixed when he asked

Two rounds, and the order matters. First: *"Why did you mess with the stage
progression? I wasn't even asking you to edit stage progression."* Correct —
one CSS line had gone in uninvited and was reverted immediately. **No stat
anywhere was touched; the big numbers in the screenshots were stub JSON in a
headless browser and never went near D1.** Then, having seen the
measurement: *"fix stage prog to live."*

The measurement was that those four values printed `N (P%)`, where N is the
run count — the percent is indeed always 100 on the top row, but the count is
not. His bar track ends at x353 and this panel's right border is x420 (a
continuous vertical line, checked down the whole panel, not read off a
screenshot), so there are **61px** there for a string that wants 115px at six
figures. It tore at a **three-digit run count** — the first afternoon of the
contest — and the old box also overhung his border by 14px. No font size
closes a 54px deficit; the string had to lose the count or the percent.

**The percent went.** He painted it twice already: the length of the bar *is*
the percentage, and his own axis letters it 0% / 50% / 100% directly
underneath. The count is the only thing in that box his artwork does not
already say. Six figures now fit where three did not, the box sits inside his
border, and it is right-aligned like every other value column on the page —
which also makes the gap self-adjusting, so a full bar and a seven-character
number still leave 8px between them where flex-start left 3px.

⚠️ **If he wants the percent back it is one line** in `draw()` — but the box
cannot hold both, so it would mean giving up six-figure run counts.
`dashfit` now lists **zero** known-open boxes, and that emptiness is
load-bearing: the day something is added back to that list it needs a reason
and a place it is written up.


---

## The combo system — shipped, and deliberately worth nothing

Client: *"can you add the combo counter into the game so it actually counts?
...or actually a combo system."*

**Consecutive stomps without landing.** HUD reads `xN COMBO` from x2 up, a
chime a semitone higher per link layered over the punch, best-of-run carried
to `MAX COMBO` on the dashboard and to lifetime stats on the device.

**The mechanic was already in the game and nothing was reading it.** A stomp
pogos him off at vy -10.5 with a fresh air jump; that bounce flies 40 ticks and
carries **256px** at run speed, against a generator minimum enemy spacing of
**256px**. A chain clears the tightest spacing by nothing at all, before the
free air jump is spent — which is exactly the right difficulty, and is why the
rule is "without landing" rather than a forgiving timer. Both numbers measured
by `tools/harness/combo.mjs`, not read off the constants.

### ⚠️ It scores ZERO, and that was his call

Asked directly, with the trade-off: every score is recomputed server-side
against a measured 61,650 ceiling, a 70,000 refusal threshold and a
400-per-second rate check, so a combo bonus risks a great run being refused
mid-contest as `implausible-rate`. He chose **no points**. The chain changes
how a run feels and what the dashboard can say; it touches nothing that decides
the prize. `ceiling.mjs` still measures 15/15 and `combo.mjs` fails if a chain
ever moves the score by a single point.

**Points are a fine idea once the contest closes** — combo multiplies the stomp
value only, ceiling re-measured, the Will Hill calibration comments updated.
Not while a prize is live.

### ⚠️ The bug the harness caught, worth not repeating

The chain-reset line was written beside a near-identical `player.onGround` test
that lives inside `if (isRelay())`. It read perfectly and shipped a combo that
**reset only under a dev flag nobody plays** — it counted up all run and never
cleared. Every check but one went green. The generic lesson: `main.js` has more
than one `onGround` test and they are not in the same block, so proximity is
not membership.

### Still to deploy

Nothing server-side changed for this — the `max_combo` column and both workers
are already live. The GAME is what needs publishing now:
`bash tools/deploy.sh` (or Git Bash on Windows) to push `dist/` to `gh-pages`.
Until then MAX COMBO on the dashboard stays 0, correctly: nothing in the live
build emits a combo event yet.

---

## ON HOLD — his side

Nothing on this list can be finished without him:

- **⚠️ D1 database + both worker deploys. NOT a KV namespace any more.**
  ```
  wrangler d1 create will-hill-contest
  wrangler d1 execute will-hill-contest --remote --file=cloudflare/schema.sql
  # paste the id into wrangler.toml AND wrangler.dashboard.toml
  wrangler deploy -c cloudflare/wrangler.toml
  wrangler deploy -c cloudflare/wrangler.dashboard.toml
  wrangler secret put DASH_TOKEN --name will-hill-dashboard   # openssl rand -hex 24
  ```
  Then set `LB_BASE` in `src/net/leaderboard.js` to the deployed worker URL.
  Until this ships the board is genuinely empty and says so.
- **Cloudflare rate limiting + Turnstile rules**, and a billing alert.
- **Contest dates** — `CONTEST_START`/`CONTEST_END` are still `0`, which the
  worker reads as "not configured, allow everything".
- ~~**AutoSprite API key / the flannel on the fall clip**~~ — **DONE.** The
  pose was regenerated with the scenery banned by name and composed back into
  the atlas; only the fall clip's three `fit` numbers changed, and `origin`,
  `frameSize` and the cell are byte-identical. Verified frame by frame against
  idle: white tee, red cap, olive cargos, no flannel, no manhole. This entry
  sat here describing a fixed problem until the client asked "we already have
  the new fall sprite, why is that even an issue" — he was right.
- **The 317MB screen recording** needs "Anyone with the link" sharing.
- **Longer MP3s**, if he prefers that to an engine crossfade.
- **RARƎ + prodbyKCTW logos**, and the original artist for menu art.
- **Real-iPhone checks:** music actually sounding, haptics actually felt, the
  Dynamic Island fix, and the lifted pads under his own thumb.
- **Manual top-3 review before paying out.** No amount of code makes a public
  web game uncheatable; the prize is claimed on a real phone, so eyeball the
  winners' score against the measured ceiling first.

---

## Decisions he made, so they don't get re-litigated

- Buttons go **on the card**, bottom.
- Empty board shows **"BE THE FIRST"**, not a blank card.
- **Will Hill is NOT pinned** on the leaderboard. The 50,000 benchmark was
  removed at his instruction; `withWillHill()` filters every pinned row.
- The MARTA card says **MARTYR** and stays that way.
- Champagne relay is **off** the title card — dev tool only.
- Title screen carries **only** PRESS START, OPTIONS, MUSIC.
- **The dashboard is a separate link**, not attached to the game, shared with
  whoever he chooses — no login.
- Contest correctness outranks aesthetics; the only look-and-feel issues that
  matter up front are ones a developer or a keen-eyed player would call poor
  quality.

---

## Harnesses

```
ceiling dashfit dashglow dashload daylamps daynight endcue entrypaths
graphwire idleflex introorder joinshot musicbox musiccheck optionsmenu padlift
panelnav pausemenu relay relaytod seamsweep share stageflag stagestrip
stagesweep titlefit titleintro
```

`dashfit` is the newest and the narrowest: it fills the dashboard from the
worker itself at two data scales and two screen widths and fails if any value
is wider than the box he painted for it. Nothing else could see that class of
bug — `dashload` grades the page under a crowd of ROWS, and it is the DIGIT
count, not the row count, that tears those boxes.

**14 graded, 210 checks, all green:** ceiling 15, daylamps 12, endcue 11,
idleflex 8, introorder 4, musicbox 11, optionsmenu 12, padlift 11, panelnav 13,
pausemenu 13, relaytod 26, share 12, titlefit 60, titleintro 12.

**7 are report-only** — `daynight graphwire joinshot musiccheck relay seamsweep
stagestrip` print tables and contact sheets for a human and have no pass/fail
line. A mechanical sweep shows them as NO VERDICT; that is not a failure.

Load-bearing beyond what they look like: `titleintro` and `musicbox` prove the
sign-up offer never eats an intro-skip or a first game. `entrypaths` proves a
run reaches the board whichever order someone enters in — the bug it was
written for was live and silent.

---

## Immediate next step

Everything is pushed and deployed. Next in build order:

1. **HOW TO PLAY** as the four-page swipe card, page 4 re-shot with the aura lit.
2. **His stage markup** → fix the layering blemishes as one batch.
3. Loop-seam crossfade, and the SHARE spinner.
