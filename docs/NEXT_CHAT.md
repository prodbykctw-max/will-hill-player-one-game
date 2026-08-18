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

**Open question worth putting to him:** a registered returning player still
sees HOW TO PLAY on every single start. That is literally what he specified,
so it shipped that way — but if he wants it first-time-only it is one
condition in `beginFromTitle()`.

---

## 4. The registration screen redo — PLANNED, NOT BUILT

This is the top of the queue and he asked to plan it before building.

### What he wants

1. Crop the contest-entry cabinet to **just the top portion** — marquee
   "ENTER CONTEST" through the screen with the NAME/PHONE/EMAIL form — instead
   of the full-height machine.
2. Present it as an **overlay**, not full-screen. His latest refinement: *"an
   overlay over how to play."* So HOW TO PLAY is the screen and registration
   is the card sitting on top of it.
3. Replace the silver knob with either the gold "SAVE & ENTER / YOUR ENTRY"
   button he drew, or a green checkmark button matching the red ✕.

### My recommendation: the green checkmark

His cabinet already teaches the player that the round buttons in that column
are the actions — red ✕ is cancel, so a green ✓ is confirm, and the pair reads
instantly with no words to translate. The gold ENTER button is the better
piece of art, but it duplicates a control the plate already carries lower
down, and at knob size the word "ENTER" would be too small to read on a phone.
Either way it has to be cut as a sprite and composited over the silver knob's
rect, the same way `tools/cut_dash_chips.py` cuts the dashboard chips.

### Why the crop has to come first

The overlay only reads as an overlay once the card is short. A full-height
cabinet laid over HOW TO PLAY covers it completely, which is just the
full-screen form with extra steps. **Crop, then overlay.** Doing the flow
without the crop is why the current build still shows the whole cabinet.

### The work, in order

1. Measure the crop box off `assets/ui-concept/contest-entry.png`
   (2,151,805 bytes; the shipped plate is `src/assets/ui/contest-entry.webp`
   at **853 × 1844**). Marquee top through the bottom of the form area.
2. Cut the cropped plate and re-derive the aspect ratio. There is a working
   precedent: `tools/trim_lb_card.py` trimmed the leaderboard ticket from
   852×1846 to 784×1596 and **prints the fraction conversion** so every
   measured rect can be remapped mechanically —
   `v' = (v * 1846 - 147) / 1596`. Copy that shape.
3. Re-measure all seven control rects. Current values, as fractions of the
   full 853×1844 plate (`index.html`, `#panelCard.cabinet.cabinet-entry`):

   | id | top | left | width | height |
   |---|---|---|---|---|
   | `#btnSave` (the silver knob) | 35.404% | 56.941% | 27.198% | 14.371% |
   | `#btnSkip` | 68.464% | 38.612% | 15.944% | 5.531% |
   | `#btnFormX` | 71.395% | 44.144% | 9.144% | 4.501% |
   | `#btnFormBoard` | 66.823% | 57.213% | 32.239% | 7.049% |
   | `#btnFormRules` | 66.823% | 65.347% | — | — |
   | `#btnFormInfo` | 84.408% | 34.978% | 10.199% | 21.909% |
   | `#panelClose` | 55.100% | 28.091% | 5.158% | 2.494% |

   `#btnSave` has `border-radius: 50%` — it is the knob. On the 853×1844
   plate the knob sits at roughly x 830–960, y 770–900.
4. Change `#panelCard.cabinet-entry` from cover-sizing to overlay sizing
   (currently `aspect-ratio: 853 / 1844`), stacked over `pvHow` with a scrim.
   The cabinet classes live on `#panelCard`, so the cleanest structure is a
   **sibling layer inside `#panel`** rather than fighting the single-view
   `show()` machinery.
5. Re-cut `glow-entry.webp` for the new geometry —
   `python3 tools/cut_glow_glyphs.py entry`.
6. Update the rect list in `tools/harness/btnglow.mjs`.

---

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
verifies nothing.

### The plate never wraps

The backdrop travels ~743px across a whole stage — less than one plate width.
There is no repeat problem, and he was explicit that the wide plates exist so
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

1. **Contest dates.** Still `0` in both workers, so
   `leaderboard-worker.js:135` returns `true` unconditionally and the window
   is unenforced. ⚠️ **DO NOT CHASE HIM FOR THESE.** Will Hill's team is in
   Australia and nobody can give him the dates until they are back; he asked
   directly to stop being asked. He will hand them over. When he does: two
   epoch-ms values in `leaderboard-worker.js:50-51` and
   `dashboard-worker.js:74-75`, then he redeploys both.
2. **A test score is on the live board** — `KCTW, 29750`. Worth clearing
   before the link goes public, or the first real entrant is playing for
   second place.
3. **Cloudflare hardening:** rate limiting, Turnstile, a billing alert.
4. **Rotate `DASH_TOKEN`** when the contest closes.

---

## 8. Session log — what landed this session

| commit | what |
|---|---|
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
  `tools/harness/startflow.mjs`, `tools/harness/startchain.mjs`.

### Answered for him this session

**"Is something stale or do I need to do a pull/push?"** Neither. Deploying is
this side's job, `gh-pages` was current, and there is **no service worker
anywhere in the repo** — assets are content-hashed, so there is no stale-cache
path that gives doubled buildings while everything else works. The bug was
real and is now fixed.
