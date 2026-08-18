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
  `stagesweep`.
- **`stagesweep.mjs`** sweeps every screen of every stage, day and night, at
  identical camera positions — 27/30/32/34 screens — for background review.

---

## NOT DONE — the live queue

### CAT 1 — Backgrounds ✅ *freeze lifted, cloud work done*
Remaining, and **waiting on his markup** of the stage sheets:
- **Layering blemishes.** He flagged the Underground. Measured: **not** the
  cloud seal (2,733px accounted for; the rectangles are present with the seal
  removed). It is the older doubling — the base plate carries its own copy of
  every building and a card sliding off that copy leaves a faint second edge.
- **"The layers on the Underground appear to be gone"** — needs verifying, not
  assuming. All 20 cards are still in the data, so if the parallax has stopped
  reading that is a different bug. Test: park the camera at two positions and
  measure each card's movement against the base.
- **Wrap seams** — every day plate is chopped at its own repeat edge.

### CAT 2 — Movement ✅ shipped
Drifting clouds live on the title and all four day stages, verified over a full
drift period. EAV is the weakest and that is the artwork — its plate is mostly
tree and Swifty sign. **Night stages have no cloud cards at all**; weather at
night would be new work, not a fix.

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
  the aura lit, bags grown and blue, and BOTH the shooter and `howswipe.mjs`
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

### CAT 5 — Sign-up ✅ shipped
Offered before a run and after death, asked once, stored forever — and now the
run actually reaches the board either way, which it did not before.

### CAT 6 — Test section ✅ shipped
`docs/TESTING.md`. Full suite green: 14 graded harnesses, 210 checks.

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
wrangler d1 execute will-hill-contest --remote \
  --file=cloudflare/migrations/001-max-combo.sql
```

Every existing row reads 0, which is correct — nothing emitted a combo event
when those runs were played.

### STAGE PROGRESSION — measured, reported, NOT changed

*"Why did you mess with the stage progression? I wasn't even asking you to
edit stage progression."* Correct, and it is back exactly as it was — one CSS
line went in during this work and was reverted the moment he asked. **No stat
anywhere was touched; the big numbers in the screenshots were stub JSON in a
headless browser and never went near D1.**

What is left is the measurement, because it is real and it is close. Those
four values print `N (P%)`, where N is the run count, not the percent — the
percent is indeed always 100 on the top row, but the count is not. His painted
bar track ends at x353 and the panel ends at x418, so there are **62px** there
for a string that wants 107px at six figures. It starts overflowing at a
**three-digit run count**, and no font size fixes it — 62px cannot hold
`444 (100%)` legibly at any size. The string has to lose either the count or
the percent, and **which one he wants to read is his call.**
`tools/harness/dashfit.mjs` lists these four as known-open and will tighten by
itself the day the entry is deleted.

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
