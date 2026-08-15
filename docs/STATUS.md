# WILL HILL: PLAYER ONE — full status

**Written for a fresh session or a new chat.** Everything shipped, everything
proposed, everything not done, everything undone, everything on hold.

- Repo: `prodbykctw-max/will-hill-player-one-game`
- `main` and `claude/last-markdown-game-link-lvk1n6` are both at **`c63a8e8`**
- Live: <https://prodbykctw-max.github.io/will-hill-player-one-game/>
- Live bundle at time of writing: `index-CootSJ06.js` (one commit behind HEAD
  — `c63a8e8` is pushed but **not yet deployed**, see "Not done")

---

## ⚠️ Read this before touching anything

1. **The container has rolled back FOUR times this session.** Local `HEAD`
   silently reverts to an older commit and uncommitted work disappears. One
   whole batch of UX work was lost this way and had to be re-typed.
   **Origin is the only truth.** Before starting: `git fetch origin main &&
   git reset --hard origin/main`. Commit and push after *every* completed
   chunk, never batch two together.
2. **Never `git add -A` on the `gh-pages` branch.** A sibling project leaked
   private files that way and its history had to be purged. Use
   `bash tools/deploy.sh`, which stages explicit paths and rebuilds
   `gh-pages` as a fresh orphan.
3. **Do not edit his artwork to solve a UI problem.** See "Undone" below —
   this was tried and rightly rejected.
4. **Never claim something works without measuring it.** House rule from the
   client, and it has caught real bugs: a "playing" audio element that was
   silent for weeks, a harness that read its own damage flash as backdrop
   light.

---

## Environment

```
dev server   (nohup npx vite --port 5199 --strictPort > /tmp/vite.log 2>&1 &)
harness      PLAYWRIGHT=/opt/node22/lib/node_modules/playwright/index.js \
             CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
             node tools/harness/<name>.mjs
build        npm run build          # verify: grep -c "Client:" dist/... → 0
deploy       bash tools/deploy.sh   # then poll the CDN for the new hash
```

Screenshots default to `shots/` (gitignored). Scratch work goes in the
session scratchpad, never the repo root.

---

## DONE — shipped and live

Newest first. Every one of these was verified by measurement, not by eye.

| Commit | What |
|---|---|
| `c63a8e8` | **Will Hill off the board**; sharing gated on entering the contest; ENTER/SHARE mutually exclusive; brag copy fixed |
| `42f0280` | Harness screenshots default to `shots/`, not the repo root |
| `ea79403` | Navigation harnesses moved onto the OPTIONS shelf |
| `de5c3f2` | **OPTIONS is a menu**; board no longer scrolls; sign-up asks once; loading screen shows the background |
| `5aca0cd` | **Intro: background first**, then the lettering falls onto it |
| `3a817fe` | EAV day: real drifting clouds, sky healed behind them |
| `4bf6d10` | **The fence glitch** — card separation bound to 16px |
| `84bf153` | Social share (SHARE MY SCORE → OS share sheet with a real card) |
| `e54edc8` | **Daytime streetlights killed** on all four stages |
| `b153516` | Three iOS haptics defects, one of which crashed iOS |
| `3b7d909` | Seamless cloud fills; his eyes follow the mouse on desktop |
| `fdcd584` | Antenna pasted into sky fixed; +2 dB music; credits loop |
| `397186c` | **The silent soundtrack** — `current` was a spread copy, gain stuck at 0 |
| `add6060` | HTML and inline-CSS comments stripped from the production build |
| `7fecbb1` | Pause menu finished; MUSIC split from SFX; leaderboard top un-clipped |

### Detail on the recent ones

**Will Hill off the board** (`c63a8e8`). The pinned `WILL HILL 50,000` row is
gone, removed inside `withWillHill()` in `src/net/leaderboard.js` so the board
and the share card cannot disagree. `lbEmpty` keeps "NO RUNS YET. BE THE
FIRST." The share caption used to read *"I took the TOP SPOT off Will Hill
himself"* — true while his score was pinned, nonsense once it was gone (every
first player would claim it), so it now only claims the top spot when someone
is actually below you.

**Sharing requires entering** (`c63a8e8`). Client: *"you shouldn't be able to
share your score until you enter the contest, and the score you share should
basically be your name on the leaderboard with your score."* Unregistered sees
ENTER THE CONTEST; registered sees SHARE MY SCORE; never both. This is also
what makes one full-width button fit on the card.

**OPTIONS is a shelf** (`de5c3f2`). LEADERBOARD / HOW TO PLAY / SETTINGS /
BACK TO GAME. Every view steps back exactly one level to OPTIONS.

**Board doesn't scroll** (`de5c3f2`). `#lbCard` is sized by *height* against
the viewport with `aspect-ratio` deriving the width. The 300px reserve is
measured: 268 left it 17px over on a 430×932 phone; 300 gives 0px.

**Intro order** (`5aca0cd`). Also fixed a real bug: `INTRO_TICKS` was 134 in
`main.js` while the plate's fade was scheduled at 148–174 in `title.js`, so
the background *never faded in at all* — the cards flew in over black and the
painting snapped on at the end. Those are one shared constant now.
`title-portrait-bare.webp` (lettering removed, sky closed) backs the intro
only; the real plate takes over the moment the assembly ends.

**Loading screen** (`de5c3f2`). Two findings: `loop.start()` was inside the
load's `.then()`, so the LOADING screen never rendered — the boot was just the
page's own black; and everything loaded in one pass. Title art now loads
first and is painted behind LOADING….

---

## NOT DONE — the live queue

Ordered as the client organised it into six categories.

### CAT 1 — Backgrounds ⏸️ **ON HOLD, at his instruction**
> *"Cancel all the potential edits… just present to me all the backgrounds as
> they are right now."*

Delivered: an 8-image gallery (4 stages × day/night) plus 4 wrap-seam strips.
Awaiting his art review. **Do not touch any background file until he says.**

Known and unfixed, for when the freeze lifts:
- **Wrap seams.** Every day plate is chopped at its own repeat edge: EAV cuts
  a tree, Edgewood cuts its corner tree, L5P slices the CRIMINAL RECORDS
  frontage mid-sign. Visible every time the background loops.
- **Cloud scrubs for Edgewood / L5P / Underground** — built, verified, then
  **reverted** when he called the freeze. `tools/scrub_stage_clouds.py`
  regenerates them in minutes.

### CAT 2 — Movement
- Title clouds drift — needs confirming on the **live** build, not dev.
- Drifting clouds on the other three day stages — blocked by the CAT 1 freeze.

### CAT 3 — Sound
- **Nothing done.** Stage tracks need longer runtimes or clean loop points:
  *"the songs need to be longer or we need to find better loop points."*
- Proposed: measure each track's loop seam, trim MP3 encoder padding, add a
  ~120ms crossfade at the wrap in `src/audio/music.js`. Genuinely longer
  tracks need **his** MP3s.

### CAT 4 — UX
- ✅ OPTIONS shelf, no-scroll board, intro order, loading screen — all shipped.
- ⬜ **Menu + HOW TO PLAY in the game's style.** See "Undone" for the approach
  that was rejected and the one to use instead.
- ⬜ **HOW TO PLAY as images.** Currently eight ✕/✓ text rows, shipped as an
  explicit placeholder. He wants real staged gameplay: standing on a pothole
  ✕ / jumping it ✓, manhole ✕/✓, walking into a ninja with money spilling ✕ /
  head-stomp ✓, champagne, big blue bags. Feasible via Playwright + the dev
  hooks (`window.__game`, `window.__startStage`); the level exposes
  `enemies`, `bags`, `champagnes`, `obstacles`.
- ⬜ **ENTER/SHARE onto the card's bottom band.** His idea. Measured: the dark
  band is y 1422–1582 (0.770–0.857 of card height), cream footer starts 1586.
  Moving the buttons on-card drops the `#lbCard` reserve from 300px to ~120px,
  growing the card from 632px to ~812px tall — making the band ~71px, enough
  for one full-width 44px button (which is all that's needed now the two are
  mutually exclusive). Verify at 430×932 **and** 375×667.

### CAT 5 — Sign-up ✅ shipped
Registration persists in `wh_contest_reg`; the offer latches in
`wh_signup_asked` so NOT NOW is honoured on later visits. Offered after death
and before a run — with two guards that cost real regressions to learn:
without `introDone` a first-timer tapping to *skip the intro* got a contact
form; without a banked run nobody could reach their first game without
clearing a form.

### CAT 6 — Test section
- **Not started.** Needs: full harness suite green in one run, plus a written
  device checklist for him (music, haptics, share sheet, sign-up persistence
  across visits, all 4 stages day/night).

---

## UNDONE — tried, then removed

**Blanking his MARTA card to reuse as a menu surface.** I built
`tools/cut_ticket_blank.py` to erase the leaderboard furniture off
`leaderboard-card.webp` so the menu could sit on his ticket. The inpaint came
out blurry and patched and he rejected it: *"that blank leaderboard looks
horrible… stop fucking with everything else."* **Nothing was ever written to
the repo** — it was a dry-run preview; `leaderboard-card.webp` is byte-identical
to the committed original (md5 `92c7daa…` both sides). The tool is deleted.

**The correct approach instead:** build the ticket in **CSS** — cream frame,
blue band, dark body, rainbow stripe, his palette. It renders crisp at any
size (a resampled bitmap cannot), costs nothing to load, and his artwork is
never opened. His card keeps backing the leaderboard view only.

**Also removed earlier:** the first `cut_title_bare.py` pass lifted all seven
title cards and measured badly (23% of the plate, seam 31.65 levels, signs and
hero returning as dark smears). Scoped down to the lettering only, seam 5.93.

---

## ON HOLD — his side

Nothing on this list can be finished without him:

- **Cloudflare KV namespace + Worker deploy.** Until this ships the leaderboard
  is genuinely empty — no scores can be submitted or read. Code is written
  (`cloudflare/leaderboard-worker.js`), deployment is a deliberate manual step.
- **Contest dates** (still 0), prize, winner contact process.
- **Longer MP3s** for the stage tracks.
- **The original artist** — he may want hand-lettered menu art rather than a
  CSS ticket, and MARTA-card-style pieces generally.
- **RARƎ + prodbyKCTW logos.**
- **Real-iPhone checks:** MUSIC actually sounding, VIBRATION actually felt.
  Haptics had three defects fixed but cannot be verified from here.
- **Pixel font licence** — resolved for now: Press Start 2P (SIL Open Font
  License, free commercially) approved this session, not yet installed.

---

## Decisions he made, so they don't get re-litigated

- Buttons go **on the card**, bottom.
- **Press Start 2P**, self-hosted, for headings and buttons; leaderboard rows
  stay monospace (matches his card's own figures).
- Empty board shows **"BE THE FIRST"**, not a blank card.
- The MARTA card says **MARTYR** and stays that way: *"let the car just say
  martyr until I'm approached about it."*
- Champagne relay pill is **off** the title card — dev tool only (`?relay=1`).
- Title screen carries **only** PRESS START, OPTIONS, MUSIC.

---

## Harnesses

`ceiling daylamps daynight graphwire idleflex joinshot musicbox musiccheck
optionsmenu panelnav pausemenu relay relaytod seamsweep share stagestrip
titlefit titleintro`

Last full green run: `optionsmenu` 12, `share` 12, `panelnav` 13, `pausemenu`
13, `titleintro` 11, `musicbox` 11, `relaytod` 26, `daylamps` 12.

Two of these are load-bearing beyond what they look like: `titleintro` and
`musicbox` are the proof that the sign-up offer never eats an intro-skip or a
first game — if you change that logic and they fail, the logic is wrong, not
the harness.

---

## Immediate next step

`c63a8e8` is pushed but **not deployed**. Run `npm run build && bash
tools/deploy.sh`, then poll the CDN until it serves the new hash — that puts
the Will Hill removal and the share gate on his phone.
