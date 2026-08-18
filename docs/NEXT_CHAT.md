# Will Hill: Player One — pick up here

Written to be read cold by a fresh session. Everything below is verified
against origin, not remembered. Longer history is in `docs/HANDOFF.md` (2,266
lines), the traps are in `docs/LESSONS.md`, the methods in
`docs/TECHNIQUES.md`. This file is the short road in.

**Repo:** `prodbykctw-max/will-hill-player-one-game`
**Branches:** work on `main`, mirror to `claude/last-markdown-game-link-lvk1n6`
**Live game:** https://prodbykctw-max.github.io/will-hill-player-one-game/
**Client:** prodbyKCTW. This is a paid 3-day contest build for his client.

---

# 🟢 CATCH-UP — main `aec476b`, everything merged, everything live

Client, and he is right to be annoyed: *"I'm so fucking confused, it's too many
chats bro. I need all three of you chats to be caught up so I can finish with
this game."* Three sessions have been landing work in parallel and he has been
the one holding the state in his head. **This block is so no chat has to ask
him anything to get current.** Re-derive it, do not trust it — see the stale
check at the top of `docs/MERGE_STATE.md`.

## Nothing is outstanding, anywhere

| | state |
|---|---|
| `claude/contest-reg-image-crop-d4y6c0` | **0 ahead of main** |
| `claude/dashboard-kills-display-sizing-wgufbm` | **0 ahead of main** |
| `claude/last-markdown-game-link-lvk1n6` | **0 ahead of main** |
| `gh-pages` | `627020d`, built from `aec476b`. ⚠️ **BEHIND BY TWO src COMMITS as of `03fdc7f`** — `efcc1b1` (canvas under the home indicator, controls with it) and `9194ffc` (one home screen on every device, PRESS START off the plate). **This is the title chat mid-flight, not a missed deploy** — it deploys its own work and did so at 11:43. Measured, not counted: live **196** assets against a main build's **197**, differing in the JS bundle, three `title-portrait-*` webps re-cut, and one new `title-prompt-*.webp`. Live bundle `index-mTnpEOyP.js` |
| Cloudflare | both workers deployed `2026-08-18T02:28Z`, `GET /top` → `200`, D1 `run_stats.max_combo` present |

⚠️ **If you are about to tell him something is undeployed, diff the build, not
the log.** A docs-only commit on main moves the hash and changes nothing that
ships. That misreading has already cost him a round.

## What each chat shipped (so nobody re-does it)

- **Title / home page** — `7e2e493`, `cec447e`, `b4f9f9d`, `4f40f5b`. Real
  buttons on the home page, a way straight into the contest, the painted
  OPTIONS sprite retired, `titlehome.mjs` (**113**, was 69). ⚠️ `titlefit`
  reads **48**, not 76 — the control geometry moved, checks were not dropped.
  ⚠️ **AND HIS LAYOUT IS THE ONLY LAYOUT — do not add a per-phone variant.**
  `4f40f5b` undoes one. He sent a picture (PRESS START, the green contest bar
  across, OPTIONS and MUSIC below it), said *"this by far is my favorite
  layout"*, and the first version rearranged itself on the two smallest phones
  into something he had never seen, with the contest button reading "ENTER"
  under PRESS START — *"now the fucking enter button looks redundant like it's
  another start button."* Heights shrink to 38px before the arrangement
  changes. Only 375x667 and 471x825 fall out of it, on measured road, and
  there the label is **CONTEST**, never ENTER. All three rules are graded in
  `titlehome.mjs`, copy included.
- **Dashboard / combo** — `eb0edd3`, `6954130`, `d9e0bca`, `dad801d`. DEATHS
  tile, MAX COMBO, the D1 migration, `deploy_backend.sh`, the combo chain, and
  the last stray ✕es off ENTER THE CONTEST.
- **Backdrops / registration** — `4a1d0cc`, `323f812`. The Underground
  doubling (`bg.separation` was in the renderer and no stage ever set it) and
  the L5P seam (two corrupt columns at the plate's own left edge, fixed by a
  tool that had never been run on it). Plus `cloudseal.mjs` now TRAVELS — it
  used to measure only at spawn, where the fault it exists to catch is zero by
  construction.

## What is actually left on the game

1. **`CONTEST_START` / `CONTEST_END` are still `0`** in both workers, so the
   window is unenforced. ⚠️ **DO NOT CHASE HIM FOR THE DATES.** Will Hill's
   team is in Australia, he asked directly to stop being asked.
   **Nothing is contingent on them** — traced: the window appears in three
   places and does two things, refuse `/submit` outside the window and make
   the dashboard clock read OPEN / OPENS SOON / CLOSED instead of NOT SET. No
   feature waits on it; it is two numbers at the end, not development.
   ⚠️ **CONTEST INFO IS IN THE SAME BUCKET** — `#btnFormInfo` is deliberately
   unwired until Will Hill's team supplies real contest copy. Do not chase him
   for that either.
   ⚠️ **AND THERE IS A DECISION HE CONTROLS THAT IS NOT A DATE.** The game
   drops 26 Aug and the contest opens sometime that week, so there is a gap
   where the game is live and `/submit` accepts everything — scores played
   before the contest opens land on the contest board and count. Wipe on open,
   leave it, or hold submissions: his call, and he can make it without a date.
2. ✅ **DONE — the MUSIC box on a cold PWA open.** Confirmed by the client on
   his installed PWA: *"the button on the main screen is unchecked and I have
   to check it when the PWA opens."* That is the fixed behaviour exactly — the
   box reads the live audio state, not the stored preference, so a returning
   player is asked for the gesture instead of being shown a ticked box beside
   silence. **Nothing further is needed here.** Original note kept below
   because the reason it could not be verified in a container still stands and
   will apply to the next audio change.
   ~~fixed in `35df100` and live, but the
   iOS gesture gate does not reproduce in headless Chromium (measured: it
   reports `running` and a loud bus under
   `--autoplay-policy=document-user-activation-required`). `musicbox.mjs`
   grades the logic by removing `AudioContext`. **HIS DEVICE IS THE ONLY
   REMAINING CHECK** — cold-open the installed PWA, do not touch MUSIC, and it
   should read unchecked and breathing.~~ — verified on device, closed.
3. **The crowd sway re-cut** for the new SHOWTIME ending plate
   (`tools/cut_still.py`). His call: *"ship it flat first, re-cut after."* — he
   has now asked for the re-cut.
   ⚠️ **THE TOOL IS FINE AND THE MASKS ARE NOT.** `cut_still.py` runs on scipy
   alone, but `tools/sam_masks/ending/{crowd,hero,prompt}.png` are all
   **1536×1024** — cut from the LANDSCAPE plate he replaced — against an
   **853×1843** painting. There is no segmenter here (`torch`,
   `segment_anything`, `cv2` all absent; `tools/captures/sam/` empty), so the
   crowd mask has to be hand-authored. On that plate the crowd is a dark, dense
   band roughly y810-1590 that TOUCHES Will Hill on stage at the left. It is
   the only one of these judged by eye rather than by a number — do it last and
   show him a frame before committing anything.
4. ✅ **DONE — the cloud leak.** `2c91a7d`. You were right that the scipy
   blocker was stale; installed here too and it was one missing package.
   ⚠️ **OWNER NOTE KEPT AND HONOURED:** the client assigned this to *"the
   original, the oldest chat"*. It was picked up by backdrops/registration
   before that message was seen. **It is finished, so this is a note about
   attribution, not a claim on the next one** — if the oldest chat was mid-way
   into it, `git log 2c91a7d` is the whole story and nothing is lost.

   The cause was NOT any card's parallax: the leak survived muting every card
   (108 → 507 with all muted). `scrub_stage_clouds.py` grew EVERY card's claim
   by 5px before subtracting it from the sky seal — a skirt that exists because
   swaying cards move — so the seal deferred ground that non-swaying cards
   never covered. On eav-day, in the 768px hole at plate x1096-1128 y70-94,
   `fence` covered 424px and the seal 62, leaving 344px owned by nothing.
   Dilation is per-card now and only swayers get it, read out of stages.js.
   **eav 104 → 46 (off the ratchet entirely), l5p 115 → 86 (allowance 200 →
   110), underground 10 → 0, edgewood 0 → 0, no over-sealing.**

5. **Clouds on every daytime stage** — his ask, and NOT the ask it sounds like.
   ⚠️ **Every day stage already drifts.** It is a COVERAGE problem: the cards
   are small and each is clipped by its `span`, so clouds come and go — eav had
   **zero cloud pixels at spawn at every tick**. `tools/spread_clouds.py`
   (built, measured, ⚠️ **NOT APPLIED**) fixes the coverage and makes the leak
   worse, because clouds in new places cross structure the seal does not own.
   The five-step sequence to finish it, and the seal rule it needs, are in that
   file's own footer. Also fixed on the way: EAV at NIGHT had the only night
   cloud card in the game and it had **no `drift`** (`72e15bd`).

   ⚠️ **AND THE INSTRUMENT WAS LYING.** `cloudseal.mjs` had an intermittent
   false positive — the same assets returned 46, 46, 47, 0 and **557**px on
   eav, spikes landing at a different position each run. The player was still
   inside the measured band and animates on his own frame counter, so the
   off→off noise floor could return to the same phase while the ON grab landed
   elsewhere. Fixed in `72e15bd`. **Do not trust a single cloudseal run for
   anything; run it three times.**

Nothing on that list blocks him playing or shipping the game today.

---

## 1. Read this before you touch anything

### The container rolls back. Origin is the only truth.

It happened **four times** in the last session. The disk comes back holding an
older snapshot; the branch pointer looks fine and the files are old. Recovery:

```bash
git fetch origin main && git reset --hard origin/main
git log --oneline -1        # verify against origin before trusting anything
```

**Push after every change.** Nothing has ever been lost, because nothing has
ever sat uncommitted. A rollback also wipes gitignored caches —
`tools/captures/sam/*.npy` in particular — which silently makes any re-cut use
stale masks. If you are about to re-run the SAM pipeline, check those exist
first.

### Never `git add -A` on `gh-pages`

Hard rule, in `CLAUDE.md`. A sibling project leaked reference photos and an
account cache onto a public branch exactly that way and had to be purged with
an orphan force-push. Deploy only with `bash tools/deploy.sh`, which stages
explicit paths and rebuilds `gh-pages` as a fresh orphan every run.

### Show him, don't tell him

He called this out directly and he was right: *"You are looking, quote
unquote, but you're supposed to be showing me."* Every visual claim gets a
rendered frame from a build verified against origin. He has been shown frames
from a rolled-back tree once and it cost trust.

### Backticks break the workers

`cloudflare/dashboard-worker.js` serves its HTML from a template literal. A
backtick or `${` anywhere inside it — **including in a CSS comment** — breaks
parsing. This has bitten four times. After any edit to that file:

```bash
node --input-type=module -e "await import('./cloudflare/dashboard-worker.js')"
```

---

## 2. Environment

```bash
# dev server
(nohup npx vite --port 5199 --strictPort > /tmp/vite.log 2>&1 &)

# harnesses
PLAYWRIGHT=/opt/node22/lib/node_modules/playwright/index.js \
CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
BASE=http://localhost:5199 \
node tools/harness/<name>.mjs
```

Dev hooks (`window.__game`, `__camera`, `__panel`, `__startStage`, `__title`,
`__pits`, `__lb`) exist **only under `import.meta.env.DEV`**. You cannot drive
the deployed build with them — compare deployed *asset hashes* against a local
build instead.

`__startStage` takes an **index**, not an id. EAV 0, Edgewood 1, Underground
2, L5P 3.

**Walk the player, never nudge `camera.x`.** The camera lerps back to the
player every frame and the generator's write head never advances; 400 steps of
nudging reports "there are no holes in this game". When teleporting, re-state
`hearts`, `screen` and `vy` every frame or the harness records nine frames of
the GAME KNOCKED overlay.

### Harness suite — all green as of `ca4e5a2`

| file | checks |
|---|---|
| `startflow.mjs` | 20 |
| `titlefit.mjs` | 76 |
| `relaytod.mjs` | 26 |
| `btnglow.mjs` | 29 |
| `dashglow.mjs` | 26 |
| `panelnav.mjs` | 13 |
| `pausemenu.mjs` | 13 |
| `titleintro.mjs` | 12 |
| `musicbox.mjs` | 11 |
| `relay.mjs` | 4 |

`startchain.mjs` is a helper, not a suite: START is a chain now, so any
harness that just wants to *reach gameplay* imports `startFromTitle(p)`.
Three harnesses broke on the flow rewire for that reason alone.

---

## 3. Where the flow stands (shipped, `ca4e5a2`)

His spec, verbatim across two messages:

> Start — sign in or not — how to play — play game — die: leaderboard and
> registration… win? Ending scene then Leaderboard and registration. If
> already registered — no registration offer, only leaderboard.

> Ask again next time they start until they're registered.

Implemented as:

```
TITLE ──tap or Space──► beginFromTitle()   [src/main.js]
                          │
      registered? ────────┴──── not registered
          │                          │
          ▼                          ▼
     HOW TO PLAY              CONTEST FORM  ──NOT NOW / ✕──► HOW TO PLAY
          │                          │  └──SAVE──────────────┘
          └───────── PLAY ───────────┴──────────► the run
```

```
DIE / WIN ──► (win: ending scene) ──► showTitle() + panel.open(…, {flow:'post'})
                 not registered → FORM ──NOT NOW──► BOARD ──BACK──► title
                 registered     → BOARD ─────────────────BACK──► title
```

**Key pieces**

- `beginFromTitle()` in `src/main.js` is the single START. Both the pointer
  handler and the keyboard/JUMP path call it. Previously only the pointer path
  ran the gate, so Space and the JUMP pad walked straight past the sign-up.
- The offer **repeats every start** until they actually enter. The old
  `signupOffered()` localStorage latch is gone, and so is the
  `localRuns().length` guard that made the gate unreachable for the brand-new
  player it exists for.
- `flow` on the panel (`'start' | 'post' | 'menu'`) decides where every BACK
  lands. Set by `panel.open(view, { flow })`. The same three views serve two
  journeys; nothing else varies.
- HOW TO PLAY's footer button reads **PLAY** and launches the run when a run
  is queued, **BACK** and returns to OPTIONS when not.
- The one guard kept: `introDone`. A tap during the title assembly means "skip
  the animation", and a skip stays a skip.

**✅ ANSWERED, AND IT IS FIRST-TIME-ONLY NOW.** He put it plainly: *"you only
show me how to play before a stage one time in the beginning… that's the only
time you show me how to play. So at the end, when I die and I hit end my run
and you present me the option to register, immediately after that, I don't
need to see how to play."*

`wh_howto_seen` is the latch (`howToSeen()` / `markHowToSeen()` in
`src/ui/panel.js`). Three call sites routed to the lesson and all three now
check it: `beginFromTitle()`, `notNow` and `save()`. Registered **and** taught
means the tap on the title IS the run — `beginFromTitle()` returns before
`panel.open()` is ever reached.

⚠️ **The contest offer still repeats and the tutorial does not.** Two opposite
rules on the same chain, which is very easy to "fix" one of by breaking the
other, so `startflow.mjs` asserts both in the same block.

⚠️ **Marked only from the START chain** (`flow === 'start'`, and not as the
sign-up card's backdrop). Reading it out of OPTIONS must not burn the one
automatic showing, or someone who browses the menu first is never taught.

---

## 4. The registration screen redo — BUILT

Shipped. His crop, his overlay, and the knob is the save control.

### What landed

**The plate is 853x992**, cut from `assets/ui-concept/contest-entry.png` at
y992 by `tools/crop_entry_plate.py`. That row is not a chosen line: it is the
darkest row on the whole plate (value 22 across it, 1.3 across the card) with
the panel below it lit at y993 — a black rule he painted — and it lands within
a pixel of where the aspect ratio of the crop he sent puts it.

**It is an overlay.** `#entryLayer`, a sibling of `#panelCard` inside `#panel`,
not a `.pv`. It could not stay in the card: the plate WAS the card's background
and a card cannot show another view through it. What sits behind falls out of
the `flow` variable that was already there — `start` → HOW TO PLAY, `post` and
`menu` → the board — so all three of his painted ways out (the card's x, the
NOT NOW / CANCEL plate, the red ✕) just dismiss the layer, and what they reveal
is where the player was going anyway. Nothing navigates.

**SAVE is the knob, as a green tick.** The crop takes his gold ENTER disc
(centre 418,1182, r116) with it. The tick is his own red CANCEL button: cross
inpainted out with a per-RADIUS median, redrawn at his measured stroke width in
his measured ink, R and G swapped so the green is his own gradient. Fitted
inside his inner ring at r=22.5 — ⚠️ **his own cross overshot that ring at
r=28**, so the cross's radius is the wrong thing to copy.

**`#btnFormBoard` and `#btnFormRules` are gone**, below the cut. Post-run NOT
NOW already lands on the board.

⚠️ **TWO CLAIMS THAT USED TO SIT HERE ARE NOW FALSE, changed in `dad801d`:**

- **`#btnFormInfo` no longer opens anything.** It opened HOW TO PLAY, which is
  a different room wearing his CONTEST INFO lettering. Client: *"the info about
  the contest goes to the how to play for some reason and it shouldn't be wired
  there."* The handler is gone; the button and his painted strip stay, because
  it is to carry real contest information later. **BLOCKED ON WILL HILL'S TEAM,
  same bucket as the dates — do not chase him for the copy either.**
- **`#entryClose` does not exist.** The tiny ✕ on ENTER THE CONTEST was painted
  into his plate, and is erased at the cut in `tools/crop_entry_plate.py`;
  `#panelClose` is gone from the DOM too. Client: *"basically exes don't need
  to be places to have back buttons."* Every view leaves by its own lettered
  control — BACK TO GAME, BACK, or his painted NOT NOW / CANCEL disc.

### Traps this turned up, for whoever changes it next

- ⚠️ **`position: absolute` on the painted controls came from `.cabinet`.** The
  sign-up used to be the third cabinet and inherited it; taking the class away
  left every control a static, full-width, VISIBLE button stacked down the
  card. Nothing else in the stylesheet does that job.
- ⚠️ **`--entry-plate` and `--entry-glow` moved to `#panel`.** They were set on
  `#panelCard`, which is no longer an ancestor of the plate, and a custom
  property that cannot be inherited is simply absent.
- ⚠️ **The `.typing` lift is in `vh` now, not a percentage of the card.** The
  old rule was 12% of an 1844-tall cabinet; the same 12% of a 992-tall card is
  half the travel against exactly the same keyboard. It clears a slab of
  SCREEN, so it is measured in screen units — and the binding case is a
  320x568 phone, not his.
- ⚠️ **Landscape needs its own cap.** At full height the card came out 96% of
  the window: fitting, not overflowing, but with nothing of the view behind it
  visible, which is the full-screen form again by another route. 86dvh.
- ⚠️ **No cqw correction**, unlike `tools/trim_lb_card.py`. That card was
  height-constrained so its artwork grew for the same box; this one is
  width-constrained, so 1cqw buys the same painted width and every font-size
  carried over untouched. The absence is the surprising part.
- ⚠️ **`tools/edit_enter_button.py`'s docstring used to end with a command that
  re-emits the shipped webp from the full-size PNG.** Running it now silently
  restores the 853x1844 plate and every fraction in `index.html` is wrong by
  1.8589 — which reads as a broken layout, not a stale asset. That warning is
  on both files.

### Graded by

`tools/harness/entryfit.mjs`, 44 checks at three viewports: the card fits, it
does not cover the screen, its aspect is his artwork's, every control takes its
own tap via `elementFromPoint`, nothing hangs off the card, the backdrop cannot
be tapped through the scrim, and the lift clears a modelled keyboard with
margin. Plus `btnglow` 27, `hapticbtn` 24, `panelnav` 13, `startflow` 20,
`optionsmenu` 15.

## 4b. The between-screens have buttons — BUILT

PM: *"let's add a score here. So people can see how much they have before
entering a new level"*, and *"we're really not pressing jump to hunting we're
just tapping the screen to continue so should we just add a next stage
button?"*

Both true. `advanceFromScreen()` had always been reachable two ways — the JUMP
pad and a tap on any pixel — so the card named the input nobody used, and
neither had anything on screen that looked pressable.

- STAGE CLEAR shows the score and a **NEXT STAGE** button.
- GAME KNOCKED offers **GET BACK UP** and **END RUN** with a continue in hand,
  **SEE YOUR SCORE** without. Two buttons removes a real trap: JUMP spent the
  continue with no way to decline, and the distinction lived in a line of prose
  a player could misread.
- Tap-anywhere is gone. JUMP and Space press the **first** button rather than
  calling something that re-derives the outcome, so thumb and keyboard cannot
  disagree.
- The ENDING gets **no drawn button** — PRESS START TO CONTINUE is lettered
  into his painting and already pulsing, so his painted prompt is the hit
  target and nothing is drawn on top.

⚠️ **Wiring that target found a bug that had always shipped.** `main.js` mapped
`ENDING_PROMPT` through `title.js`'s `SRC_W/SRC_H` — 853x1844 against the
ending plate's 1536x1024 — putting the glow at x=605 on a 430px phone. Off the
right edge, always: that prompt has never pulsed. Both constants are called
`SRC_W`, which is the whole reason it read as correct. `render/ending.js`
exports its own now. Full write-up in `docs/LESSONS.md` 21.

Graded by `tools/harness/betweenscreens.mjs`, 15 checks — including that a tap
OFF a button does nothing, on every one of the three screens, which is the half
nobody would notice until the game is a dead end.

## 4c. The ending is his painting now — BUILT

He replaced the landscape mockup with **853x1843**, the same shape as the
cabinet and the dashboard. Fitted to his phone the old 1536x1024 plate painted
430x287 with more than half the screen black; this one covers it with three
pixels to spare. He asked the generator for 1024x2212 and got 853x1843 — same
ratio to four decimals, same pixel size as every other shipping plate, nothing
resampled.

`src/render/ending.js` went from ~300 lines to ~140 and now draws **eight
numbers and nothing else**. No title repaint, no label table, no panel inpaint,
no rank. Every word on screen is his.

⚠️ **THE STAT LIST TOOK TWO PASSES AND IT IS THE SAME TRAP AS LAST TIME.** The
plate first arrived listing ENEMIES DEFEATED / BOSSES DEFEATED / TIME / MAX
COMBO / SCORE — the standard beat-em-up set, and word for word the list
`ending.js` line 20 already recorded rejecting for the OLD mockup. This game
has no bosses (three comments in `src/world/` say so) and no combo meter.
Whatever is generating these plates reaches for that set by default, so
**check the labels against the game before wiring any future pass.** He
relettered it himself rather than have his artwork repainted, which is his
standing preference and the better outcome.

(MAX COMBO was the one that could have been real — every log event carries a
millisecond stamp, so the chained-stomp run the punch sounds already escalate
on is derivable with no new state. He picked the eight that exist.)

**Geometry**, printed by `tools/cut_ending_plate.py` off the plate itself:
labels x547 (never drawn over), values right-aligned at x780, baselines
483/516/550/583/617/651/684/717, 25px face, ink `#e1bb88` sampled off his own
`$31,200`. RESTART is x169-673, y1620-1761.

⚠️ **Only the VALUES are emptied, and not by a column cut.** His longest label
ends at x728 and his longest value starts at x696, so they overlap in x — a
vertical erase eats the end of two labels. The tool goes per row, finds the
widest gap in that row's ink, and erases outward from it.

**The flow, his words** — *"die or win? Ending scene then Leaderboard and
registration"*:

```
last stage cleared → 'complete' → his ending draws, stats tally (56 ticks)
                   → at tick 140 the board opens OVER it, once per run
                   → dismiss  → his painting again, with RESTART
                   → RESTART  → a fresh run
```

`state.resultsShown` is the latch and it resets in `startRun()`. Without it the
board reopens on the next frame and RESTART can never be pressed. `update()`
returns early while the panel is open, so the tally does not run on behind it
and the 140 is ticks the player actually saw.

⚠️ `ending-crowd.webp` and `ending-hero.webp` are **deleted**. They were cut
from the landscape plate and mean nothing on this one. The sway is a separate
pass — *"ship it flat first"* — and `tools/cut_still.py` is what does it.

## 5. Also open

**Contest screen glow harder.** *"The letters and shit aren't flashing hard
enough."* The pulse is `@keyframes glyphglow` in `index.html`, 3.6s, opacity
0.26 → 1. Raise the floor or the bloom weights in `tools/cut_glow_glyphs.py`
(`CORE 0.44`, `HALO 1.00`, `WHITEN 0.22`).

**ALERT → push notifications.** Scoped only, no work done. There is no service
worker, no VAPID keys and no subscription storage anywhere in the repo; ALERT
is painted decoration with no id, no rect and no handler. This is a real
feature, not a toggle — recommended after the contest.

**Underground leftovers.** Loop-seam crossfade; SHARE spinner.

**Background sweep.** See §6 — one class of bug was just found and there is
now a repeatable method for finding the rest.

---

## 6. The background-ghost method (use this, it works)

The "double buildings" the client kept reporting are **not** one bug. Two
distinct faults have now been found and they behave differently.

### Fault A — depth separation (fixed everywhere)

The base plate keeps a **full copy of everything a card redraws**. That is the
invariant the parallax rests on, and its consequence is that **ghost amplitude
IS depth amplitude**: a card offset N px prints its content twice, N px apart.

```
separation ≈ 16 * tanh(camX * (depth - 0.5) * 0.010 / 16)
```

Letters draw about 18px tall, so 6–16px of offset is a 35–89% double. **A card
at exactly `BASE_DEPTH` (0.50) cannot ghost** — identical offset by
construction. Every lettering card in the game now sits at 0.50: CITGO, SALE,
WAFFLE HOUSE, the Edgewood shopfronts, and as of this session Underground's
`trees` (which, despite its name, owns the whole PEACHTREE FURNITURE
signboard — 27,046 opaque px against `peachtree`'s 7,982, which is all
parapet).

Sway bands are the same fault in miniature: shearing painted lettering ±3px
against a static copy of itself. The band over `xRanges [0.730, 0.950]` ran
straight across that signboard and has been removed.

### Fault B — a crumb on the wrong card (this is the new one)

**"P PEACHTREE" was not fault A.** The base plate was clean. Base + all
fifteen cards recomposed at zero offset was clean. The segmenter had given the
`lamps` card a **10×19px crumb of the sign's own capital P** — the letter sits
beside the lamppost and reads as part of it to a grid-sampled mask. `lamps` is
at depth 0.78, which is +15px at the far end of the stage: almost exactly one
letter width. So the crumb printed a P one letter left of the base's own.

**The card that OWNS an object is not necessarily the card ghosting it.**
Muting `trees`, which owns the whole board, did nothing. Muting `lamps` fixed
it.

### Fault C — a moving card ON TOP of a co-planar one

EAV, in his words: *"the CITGO sign, you got it cut with the fence and it's
moving. It shouldn't be cut at all. You got the line between that messed up
and then the edge of the fence is messed up."*

`fence` (x324–1183) overlaps `citgo` (x181–830) and draws **after** it. At
depth 0.67 that is +11px at the far end, so the fence's left edge crawled
across the sign and the occlusion boundary between them moved as the player
ran. The same 11px also shifted the fence's own boards against the base's copy
of them — vertical boards doubling against themselves.

The depth was wrong from the start: **the sign is mounted on that fence.** Same
distance, so same depth. Both are 0.50 now, day and night.

This is different from A and B and needs its own check, because overlap alone
is not the tell — a tree in front of a distant sign *should* slide against it.
Three conditions have to hold together: shared opaque pixels, the mover drawn
**after** (so it is the one occluding), and the two not genuinely at different
distances in the painting. `tools/card_overlaps.py` prints the shortlist with
the crawl distance for each pair; the third condition is a judgement call
against the art and no tool makes it for you.

Swept after the fix. What is left on the list is all legitimate near-over-far
— EAV's tree, verge, shrub and pole over the fence and sign; Edgewood's
pavement and lamps over the shopfronts; Underground's lamps over the trees and
Peachtree; L5P's kerb and pole over the buildings. Those pairs are the effect
working. One to look at with fresh eyes: `skyline d=0.05 drawn OVER trees` —
a far card occluding a nearer one is backwards, though it may just be distant
foliage.

### Fault D — the number that was never wired up (this is the big one)

**`bg.separation` did not exist in `stages.js`, on any stage, ever.**

`src/render/backdrop.js` has carried `maxSep(stage)` since `ca206e4`, reading
`bg.separation` per stage and falling back to `MAX_SEPARATION = 16`. That same
commit wrote, in the comment directly above it: *"a stage can declare its own
`bg.separation` and **Underground takes 4**."* The renderer half shipped. The
stage-table half was never written — `git log -S separation -- src/world/stages.js`
returned **nothing, not one commit**, right up until this session.

So the stage of signs ran at the 16px cap for its whole life, and the comment
that introduced the mechanism names the exact symptoms the client kept
reporting: *"'P PEACHTREE', 'SA SALE', a second street sign beside the first,
and the arch's lettering smeared into itself."*

Measured on Underground at 82% of the stage, before and after, off the live
game rather than off the formula:

| card | before | after |
|---|---|---|
| `towers` | **−15.3px** | 0.0 |
| `backdrop` | **−14.9px** | 0.0 |
| `leftblock` | **−14.1px** | 0.0 |
| `furniture` | **+13.0px** | +4.0 |
| `lamps` | **+13.4px** | +4.0 |

⚠️ **The far three all SATURATED the clamp, so they were within 1.2px of each
other — there was no parallax between them at all.** The whole far group walked
15px off the base as one block and printed a second skyline beside the first.
It was buying a doubled downtown and nothing else, which is why moving all
three to `BASE_DEPTH` costs the picture nothing you can see. The near two keep
their depth and now double by 4px, inside a lamppost's own width.

**And Fault A's fix had only ever been applied to half of a matched pair.** The
night `trees` card — which owns the PEACHTREE FURNITURE signboard, exactly like
the day one — was still at `depth: 0.48` with the third sway band running
across the board, while the comment block above it described the fix as done.
The two `bg` objects are separate and `?tod=day` REPLACES `bg` wholesale
(`bg: day.bg`, no merge), so anything applied by eye lands on whichever variant
happened to be open. **Grep both halves. Every time.**

### ⚠️ Fault E — the seal defers to a card that moves

`tools/scrub_stage_clouds.py` builds the sky seal as `struct & ~others`:
structure another card already owns is deliberately LEFT OUT of the seal,
because that card will redraw it over the weather. Sound, with one unstated
premise — that the owning card redraws it **in the same place**. A card away
from `BASE_DEPTH` does not.

That is why Underground's seal is **297 opaque px** against 10,776 on
`eav-day`, 22,775 on `edgewood-day` and 5,849 on `l5p-day`. Its whole sky band
was owned by `towers`/`backdrop`/`leftblock` at 0.07/0.12/0.18, so the seal was
told to skip all of it, and the cards then slid out from under the gap they had
been trusted to fill. `towers` shares 9,887px with the clouds card.

`tools/card_overlaps.py` now prints a **SEAL ASSUMPTION** section for this: any
card intersecting the clouds card and not at 0.50. It is clean as of this
session. ⚠️ It compares against the clouds card's STATIC alpha; the clouds
DRIFT, so the honest question is which ROWS a cloud can occupy, and against
that sweep `eav-day`'s `tree` (11,365px) and `pole` (8,602px) and `l5p-day`'s
`pole` (1,813px) are all still moving in the cloud band. Those are the two
leaks the travelled harness now measures — see below.

### How to find the next one

```js
// in a live frame, at a camera position where the artifact shows
window.__game.level.stage.bg.cards.find(c => c.key === 'lamps').span = [0, 0];
```

Mute one card at a time, screenshot the same clip, diff. Snapshot the true
spans **once, up front** — restoring from a per-iteration copy is easy to get
subtly wrong. Mute *all* cards first as a control: if the artifact survives
that, it is in the base plate and this method will not find it.

Then erase the crumb with `tools/drop_card_crumbs.py`, which holds an explicit
rect table and is re-runnable after any re-cut.

**Deleting from a CARD is lossless** — the base still paints the pixel where
it belongs. Deleting from the BASE is not, which is why `tools/erase_carded.py`
was built, measured (collar came out at 46–84% of the hole) and abandoned.

**Do not use a size threshold to find crumbs.** The same `lamps` card carries
a 192px sliver at x354–360 that is the lower half of a lamppost, directly
beneath its 680px upper half. Dropping it by size leaves a streetlight
floating in the air.

### Pipeline order is load-bearing

`cut_planes.py` → `scrub_stage_clouds.py` → `drop_card_crumbs.py`.
`cut_planes` **rewrites** `<stage>-base.webp` from the original plate, and the
scrub's seal deliberately skips pixels another card owns — so it can only do
that if the cards already exist. Crumb removal comes last because
`cut_planes` would undo it.

### Verification tools, and the way they lie

Both of these graded their own memory at one point. Fixed, but know the shape:

- `tools/sam_coverage.py` held its own crop table (underground at 0.78, two
  plates stale) and knew nothing about day stages. It now imports from
  `sam_segment`.
- `tools/preview_planes.py` looked up `id: '<stage>-day'`, which does not
  exist — a day variant is a `day: { bg: { cards } }` block inside its parent
  — so **every day cut in the project had gone ungraded**, four plates' worth.
  Current numbers: underground-day 0.001%, underground 0.002%, eav-day 0.308%,
  l5p-day 0.412%, edgewood-day 0.338%.

A verification tool holding its own copy of the thing it verifies against
verifies nothing. `tools/card_overlaps.py` was the third: it hardcoded
`MAX_SEPARATION = 16`, so the moment a stage declared its own cap every crawl
distance it printed became fiction. It reads `bg.separation` now.

### ⚠️ AND A HARNESS THAT DOES NOT TRAVEL CANNOT SEE ANY OF THIS

`tools/harness/cloudseal.mjs` — the regression test for the longest-running bug
on the project — called `__startStage`, let the camera converge **at spawn**,
and sampled six ticks there. Card separation is `camX * (depth - BASE_DEPTH) *
DEPTH_SPREAD`, so **at spawn every card's offset is zero.** Ticks move `drift`
and `sway`; they do not move the camera. The one test written to catch clouds
crossing buildings was measuring the single camera position at which the fault
cannot exist, and it stayed green for weeks while the client photographed the
bug off his phone.

It travels now — five positions from spawn to the finish line — and three
things had to be got right to make that a measurement rather than a number:

1. **Hold him at his STANDING height, not at `y=-40000`.** `stagesweep.mjs`
   parks him far above the level to clear him out of a picture; that is wrong
   for a measurement. The camera lerps toward the player every update and the
   update runs on a fixed-timestep accumulator, so a slow frame takes two
   sub-steps. With a 40,000px error one doubled sub-step moved the backdrop
   38px for exactly one grab, and the harness reported 127,196 px of a
   143,190 px band as cloud on a building. Held at his standing y the error is
   zero and the sub-step count stops mattering.
2. **Converge the camera FREE, then lock it at the point it chose.** Forcing a
   value the lerp is not already at re-opens the transient every frame. And the
   lock applies at spawn too — converging is not the same as being still.
3. **Sandwich the noise floor around the measurement**: off → ON → off, per
   tick. Taking every off-frame in one pass and every on-frame in another put
   minutes between the two halves of a subtraction.

### ⚠️ THE L5P "SEAM" WAS NEVER A SEAM — and this claim above was wrong twice

Two corrupt columns at the LEFT EDGE of `l5p-base`, luma **251.6 and 142.4** in
front of a plate whose next column is 5.0: a white line down every row,
repeated at every plate width. `edgewood-base` had one at its right edge (62.3
against 3.0). Not a content discontinuity, not a repeat problem — a resampling
artifact left at the frame border by whatever produced the plate.

`tools/fix_seam.py` was written for exactly this, documents it in its own
header, and **had never been run on these two plates.** One command:

    python3 tools/fix_seam.py --measure     # l5p ratio 37.2, edgewood 9.8
    python3 tools/fix_seam.py --repair      # -> 0.6 and 0.5

`--repair` CLAMPS — the first good column is copied outward over the bad ones.
No crop, so the plate width and every `span` / `xRanges` / `light.x` fraction
in `stages.js` is untouched. `seamsweep` after: **L5P's worst join step 194.1 ->
6.0** (median 190.8 -> 3.7), edgewood 26.2 -> 9.8, and every stage's join now
sits BELOW its own frame's p99. The whole harness's worst edge fell from 194.1
to 29.9.

⚠️ **Do not reach for mirroring.** `drawPlate`'s own comment rules it out: these
are real Atlanta streetscapes and a flipped copy renders CITGO and WELCOME TO
EAST ATLANTA as backwards text.

### The EAV leak — narrowed, still open

**Two leaks the travelled harness found the day it learned to travel, on stages
nobody had reported:** `eav` 104px (biggest blob 82) at 11,290px into the stage,
and `l5p` 115px (blob 73) at 7,200px.

`eav`'s was then run through the mute-one-card method at that exact camera and
tick, and the answer is a NEGATIVE one worth having:

| muted | leak |
|---|---|
| baseline (all cards) | 108 |
| **CONTROL: every card muted** | **507** |
| `skystruct` | 229 |
| `fence` | 386 |
| every other card, one at a time | 108 — unchanged |

**It survives muting every card, so it is not a card's parallax** — which is
what the control is for, and it rules out the `tree` (11,365px) and `pole`
(8,602px) suspects the static cloud-row sweep had flagged. `skystruct` and
`fence` both actively reduce it, so the seal is doing real work and what is
left is a HOLE IN THE SEAL: base-plate structure in the sky band that
`scrub_stage_clouds.py` did not seal and no card covers.

The fix is therefore to regenerate `eav-day`'s seal, not to move a depth.
⚠️ `scrub_stage_clouds.py` imports `scipy.ndimage` and **scipy is not installed
in this container**, so that cannot be done here.

⚠️ **And one dead end, recorded so it is not repeated:** mapping the leak box
back to plate coordinates used `groundFrac 0.71` — Underground's — against
EAV's real **0.88**. The plate region that produced (a brick wall fully covered
by `eav-day-fence` at alpha 1.0) was therefore the WRONG REGION, and no
conclusion from it stands. Redo the mapping with the stage's own `groundFrac`
before believing any plate-space coordinate. Both predate this work. ⚠️ **eav's does not respond
to the fix that closed Underground's** — measured directly, with `separation: 4`
applied to all four stages Underground went 10 → 8px while eav went 104 → **142**
and l5p 115 → 70. So eav's is a different fault and is still undiagnosed. Both
are carried as a named `ALLOW` ratchet in the harness that may only ever go
down, an order of magnitude under the 1,259px / 734px-blob crossing the file
was built to catch.

### The plate DOES wrap, and this claim was wrong

~~The plate never wraps.~~ Underground's plate draws 984px wide against a 430px
screen, and `par` reaches 694px by 82% of the stage — so the join crosses the
screen from about two thirds in. Measured with `seamsweep.mjs`, which has known
this all along and says so: **the plate join is on screen in 32 of 94 frames**
on Underground. What saves it is the step size, not its absence — worst 13.9,
median 12.4, and a ratio of 0.57x against that frame's own p99, i.e. quieter
than the ordinary detail around it.

⚠️ **L5P is the one to actually look at**: join step **194.1, median 190.8,
ratio 7.29x**, on 26 of 100 frames. That is seven times the frame's own p99 and
it is a real visible seam. Untouched this session and not reported by the
client, but it is the worst number in that harness by a factor of fourteen.

The rest of the original note stands: the wide plates exist so stages do not
repeat, **not** so layering stops, and he was explicit that the wide plates exist so
stages do not repeat, **not** so layering stops: *"I still want parallax
scroll with depth… like how you had the underground stage with the layers,
things at the bottom being closer, things at the top further away, the
trashcan and the newspaper machine — I love that."*

---

## 6b. The daytime realism audit — mostly a false alarm

The client asked for these plates to be reviewed as photographs of real
Atlanta streets: find what would not exist in the real world. Worth recording
what came out of it, because two of the findings were **wrong** and should not
be re-opened.

**The method that produced the errors:** judging detail off downscaled crops.
A 1532px plate viewed at half width hides exactly the evidence that decides
these calls. Everything below was re-checked at 3-4x on the native plate, and
that is the only resolution at which any of it means anything.

- ~~Nothing casts a shadow in daylight~~ — **WRONG.** The plates already carry
  painted contact shading: under the cars, along the fence-to-grass line,
  under the shrubs. A `tools/bake_ground_shadows.py` was built to add contact
  patches (card alpha → ground line → soft patch, painted onto the RECEIVING
  surface because the grass card draws over the fence card). It worked, and it
  added nothing a viewer could see, because the shading was already there. The
  tool was deleted rather than left lying around for a problem that does not
  exist. Same disposition as `erase_carded.py`.
- ~~Overhead wires end in mid-air~~ — **WRONG.** At 4x they run pole to pole
  in proper catenary sags with insulators on the crossarms. At 1x the thin
  wires fade against a bright sky and read as broken spans.
- ~~The Edgewood neon~~ — a real sign carrying a real Atlanta phrase. It stays
  exactly as painted. Flagging it was a content judgement smuggled into a
  realism task; the client was right to reject it.
- ~~L5P's wet road under a blue sky~~ — an ordinary afternoon after a shower.
- The EAV pedestrian signal and the centre-line/traffic-direction mismatch
  were over-called and never confirmed. The crosswalk may sit off-frame and
  those cars may be parked.

**What survives.** Two things, and only one of them is objective:

1. **The Edgewood hours board is pixel mush.** Under `SOUL FOOD & SPIRITS`, a
   HOURS header and three day rows rendered as noise. The client's ruling
   allows fixing this: *"if you wanna make them legible, then we could do
   that... but we're not trying to change anything text wise."* Legibility
   only — same words, redrawn so they read. Nothing else in any plate.
2. **Warm windows and bulbs render at night intensity in the day plates** —
   a judgement call, not a defect. Lights being on in the day is real; whether
   the bloom on them is too strong is the client's taste to rule on, and he
   has not.

**One real bug did come out of it.** `drop_card_crumbs.py` was writing cards
back at `quality=92` when `cut_planes.py` cuts them at `94`. These are lossy
WebP, so re-saving below the quality they were made at degrades the entire
card to edit one strip of it — measured at ~16,000 px of pure recompression
noise on a single pass, which briefly looked like shadows landing in the sky.
Fixed. **Any future tool that rewrites a card must save `'WEBP', quality=94`.**

## 7. Still on him (blocking the contest)

Both workers are **deployed and live**, and the shipped game bundle really
does point at `will-hill-leaderboard.prodbykctw.workers.dev` (grepped in the
deployed JS, not the source). `/top` answers. The dashboard's bare-root 404 is
its own `notFound()` at line 62 — correct for a request with no `?k=` token,
not a missing worker.

⚠️ **THE BACKEND IS DONE — the migration ran and both workers are deployed.**
Verified against the live account on 2026-08-18: `run_stats.max_combo` is
present (and is the LAST column, which is the signature of the migration's
`ALTER TABLE` rather than a fresh `CREATE TABLE`), both workers were deployed
at 02:28Z, and the deployed leaderboard worker carries `MAX_COMBO`, the `combo`
branch and `max_combo` in its INSERT. `docs/MERGE_STATE.md` said otherwise for
a while and was simply out of date — he had to ask "are you sure the D1
migration is needed?" to get it caught. Re-derive from the account, never from
a doc.

1. **Contest dates.** Still `0` in both workers, so
   `leaderboard-worker.js:135` returns `true` unconditionally and the window
   is unenforced. ⚠️ **DO NOT CHASE HIM FOR THESE.** Will Hill's team is in
   Australia and nobody can give him the dates until they are back; he asked
   directly to stop being asked. He will hand them over. When he does: two
   epoch-ms values in `leaderboard-worker.js:50-51` and
   `dashboard-worker.js:74-75`, then he redeploys both.
2. **Cloudflare hardening:** rate limiting, Turnstile, a billing alert.
3. **Rotate `DASH_TOKEN`** when the contest closes.

### ✅ The test score is cleared — the empty board is CORRECT

`KCTW, 29750` is gone. **He cleared it himself, from PowerShell**, which is
exactly what the note that used to be here asked for. Recorded because an
empty board looks alarming and the investigation is not free — this cost one
round of exactly that:

- All **five** tables are empty, not just `runs`. `entrants`, `run_stats`,
  `seen_runs` and `rejects` too, so his own registration went with it. That is
  a deliberate clear, not damage.
- The **schema is intact** — five tables, ten indexes, verified against
  `sqlite_master`. Nothing was dropped.
- The database is **healthy**: `/top` answers 200 with `X-Cache: MISS`, which
  means the worker really executed SQL against D1 and got a result. An empty
  board is the correct render of empty tables.

⚠️ **`d1_databases_list` reports `num_tables: 0` for this database and that is
WRONG.** It is a stale summary field. Query `sqlite_master` before believing
any claim that the schema is gone — the difference between "he cleared the
rows" and "the schema was dropped" is the difference between nothing being
wrong and a rebuild.

⚠️ **Nothing in this repo can empty that database, so never suspect a deploy.**
`tools/deploy.sh` publishes static files to `gh-pages` and never speaks to
Cloudflare. `cloudflare/schema.sql` is all `CREATE TABLE IF NOT EXISTS` with no
`DROP`. The only `DELETE` in either worker is the supersedes cleanup on
`run_stats`. A wipe is always something a human ran.

**Still genuinely unproven:** that a score can SAVE. The read path is
demonstrated; the write path has had no run through it since the clear, and
proving it means writing to the live database. Worth doing deliberately before
the link goes public rather than finding out from the first real player.

---

## 8. Session log — what landed this session

| commit | what |
|---|---|
| (this one) | His SHOWTIME plate, and the board that arrives on top of it |
| `e434a1a` | Buttons on the between-screens, and the score before the next level |
| `cefe39b` | The harnesses know the card, and optionsmenu stops defending the old flow |
| `df147ee` | His sign-up card, cropped out of the machine and laid over the room |
| `27ca8a4` | The fence and the CITGO sign are the same distance away |
| `33b4a68` | The extra P was a crumb of the sign on the lamppost card |
| `ca4e5a2` | Post-run, the board is the last stop — and the harnesses know the chain |

- Underground's "P PEACHTREE" traced and fixed (§6 fault B), plus the `trees`
  card moved to base depth with its sign-shearing sway band removed.
- START rewired to CONTEST → HOW TO PLAY → run, both doors, asking every start
  until registered.
- Post-run routing: form → board → out, one `flow` variable instead of
  hardcoded per-button destinations.
- Pinch and double-tap no longer zoom the page. The viewport meta already said
  `user-scalable=no`; **iOS Safari has ignored that since iOS 10**, so on the
  browser he tests in it had never done anything. Fixed with
  `touch-action: manipulation` on every panel control plus
  `gesturestart/change/end` and a multi-touch `touchmove` guard, inline in
  `index.html` so a pinch during asset load is covered.
- EAV's fence pinned to base depth with the CITGO sign it is mounted on (§6
  fault C), both variants.
- New: `tools/drop_card_crumbs.py`, `tools/card_overlaps.py`,
  `tools/crop_entry_plate.py`, `tools/harness/startflow.mjs`,
  `tools/harness/startchain.mjs`, `tools/harness/entryfit.mjs`,
  `tools/harness/betweenscreens.mjs`.
- ⚠️ `optionsmenu.mjs` had been red on `origin/main` for a while — five checks,
  three of them defending the flow `ca4e5a2` replaced. Verified against a
  worktree of origin before being changed, which is the only way to tell a
  stale harness from a regression you just caused. They look identical from
  inside your own branch.

### Answered for him this session

**"Is something stale or do I need to do a pull/push?"** Neither. Deploying is
this side's job, `gh-pages` was current, and there is **no service worker
anywhere in the repo** — assets are content-hashed, so there is no stale-cache
path that gives doubled buildings while everything else works. The bug was
real and is now fixed.
