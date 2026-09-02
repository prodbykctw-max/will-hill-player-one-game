# Will Hill: Player One — Game Design Document

**Status: living document, comprehensive as of 2026-08-10 — not a locked spec.** This captures every design decision confirmed in development conversation so far. Update it as the design evolves; don't let decisions live only in chat history.

## Who's who

Worth stating plainly, because it has already been got wrong once:

- **Will Hill** is the ARTIST the game stars, and the player character. The
  run through the stages is him making his way to his performance.
- **prodbyKCTW** is the DEVELOPER — the person building this. Not the
  character. One token: lowercase `prodby`, uppercase `KCTW`, which is an
  acronym for **K**nowledge **C**hange **T**he **W**orld. Never split it into
  "KC TW". His legal name is Melvin D. Brown III, which belongs on paperwork,
  not on screen.

So "the user ran the asset chain" below means prodbyKCTW ran it, producing art OF
Will Hill. Any voice or foley recorded for the game is prodbyKCTW's own unless a
source says otherwise, and should be credited to him, not to Will Hill.

## Story & core loop

Will Hill is on his way to his performance — the run through the game's stages *is* him making his way to the show.

- **Collectible/currency token:** money bags. "Collect the bag" is the core objective/scoring loop.
- **Power-up:** champagne bottles — grant **9 seconds** of invulnerability AND a **2x money multiplier** on pickup. (This said 30 seconds for a long time and the code never did: `CHAMPAGNE_SECONDS = 9` in `src/entities/player.js`, `CHAMPAGNE_MULT = 2` in `src/entities/collectibles.js`. While it is lit the bags are drawn **grown and blue** — the two cues say the same thing, and the HOW TO PLAY page has to show it.)
- **Combat:** none. No sword/melee system.
- **Core mechanic — Mario-style stomp:** jumping on top of an enemy defeats it. Side/head-on contact damages the player instead.
- **Platforming:** platforms are asphalt-textured (visually distinct street/road material within the level geometry).
- **Enemy behavior & physics — confirmed "exactly like Mario":** classic bounded patrol AI (enemies walk back and forth within a range — but ⚠️ they do **not** walk off ledges any more: `canStand()` in `src/entities/enemy.js` probes the leading edge and turns them at the brink, because a patrol that suicides into a pit removes the hazard the player was supposed to deal with), standard platformer physics (gravity/jump arc, solid ground + floating platforms, pits/gaps as hazards). This is the well-understood Mario ruleset transplanted onto the Atlanta setting — no novel mechanic being invented.
- **Camera:** pulled back further than a typical side-scroller, with extra headroom so the player can see upcoming obstacles, platforms, and enemies before reaching them. Same rationale as a Mario-style camera looking ahead of the player, just pulled back further.
- **Movement/perspective:** side-scroll, in the same style as the Jandé game's Action RPG mode (`once-upon-a-time` repo) — explicitly **not** a Streets-of-Rage-style brawler (an earlier framing that was corrected) and **not** isometric (an isometric animation set exists but is unused — see Character Asset Pipeline below).

## The finish line is the bank (2026-09)

Client: *"banking at each finish line, robbery only risks the current
stage's pocket."* Money in hand when a finish line is crossed is **banked**
— locked into the run's score for good. An enemy knockdown scatters only
what was picked up since the last finish line (the pocket); the score can
never fall below the banked amount. The contest number, the board, the
share card and the knocked screen all read this same score. This replaced
the original everything-scatters rule after a tester's five-stage run ended
at $950 off one late hit. `tools/harness/bankline.mjs` grades it; the
Worker needs no change because both sides compute from the same event log
and a capped knockdown simply emits fewer `bagLost` events.

## Damage: three touches, and enemies rob you

Three enemy touches kill you, and the consequences differ by touch — but there
is no hit counter. It falls out of one rule:

**An enemy knocks your money loose; a pothole only trips you.**

Because the money is gone after the first hit, the sequence sequences itself:

| touch | what it costs |
|---|---|
| 1 | your money, scattered across the street, **and** a heart |
| 2 | a heart (nothing left to rob) |
| 3 | the last heart — dead |

The bags arc out with physics and are recoverable after 750ms, so a hit is a
scramble to get your money back before the enemy reaches you again, not a flat
penalty. Capped at 8 bags so a rich run cannot spray dozens of physics objects
in one frame. Each one emits a `bagLost` event (-100, mirroring `bag`), so the
server's recomputed score still agrees and a recovered bag scores again.

**Enemy vs obstacle is expressed in the reaction, not in a different clip** —
there is no dedicated hit animation, so the *motion* carries the difference:

|  | pothole | enemy |
|---|---|---|
| direction | pitches **forward**, momentum dies | knocked **backward**, away from it |
| vy | -3.2, a stumble | -7, a real recoil |
| control | steering and dash locked 26 ticks | free immediately |
| money | keeps it | loses it |

A pothole is the street tripping you up. An enemy is a person hitting you.

**Power-up.** The champagne bottle grants **9s** of invulnerability and a **2x
money multiplier** (`CHAMPAGNE_SECONDS`/`CHAMPAGNE_MULT`). It was 30s, which is
a very long time to be untouchable in a game whose whole tension is three
touches. That has
to be legible on the character rather than only in a HUD timer — your eyes are
on him, not the corner. He gets a warm pulsing bloom with motes orbiting, and
it fades over the last two seconds so the power running out is something you
see coming instead of discovering by dying.

## Setting: Atlanta, 5 stages

**Criminal Records is the finale.** Stage order is EAV -> Edgewood ->
Underground (Five Points) -> Little Five Points. Will Hill is travelling to
his show and the show is at Criminal Records; real acts have performed there.
The route is a real MARTA journey — East Lake, Edgewood-Candler Park, Five
Points to transfer, then back east to Inman Park-Reynoldstown — which is what
the between-stage map screen will show.

Five stages, each a real Atlanta neighborhood, rendered as an exact-replica map using real landmarks — in the visual/structural spirit of *Michael Jordan: Chaos in the Windy City* (SNES beat-'em-up built around a real-city map; referenced for its real-city-map structure only, not its combat system), with a gritty 90s tone.

1. **East Atlanta Village (EAV)**
2. **Edgewood**
3. **The Underground (5 Points)**
4. **Little 5 Points**

Stage 5, the finale: the Buckhead Theatre — client-supplied night/day pair, added 2026-09; the ending scene follows its finish line.

### The game keeps Atlanta's clock, wherever it is played

*"The goal was to bring Atlanta to the world. If I'm in California and I'm
playing this game, the time it is in Atlanta needs to be the time it is in this
game. If I'm in Australia and I'm playing this game, the time it is in Atlanta
needs to be the time it is in this game."*

Day and night are decided by the hour in **America/New_York**, not by the
device. A player in Sydney opening this at their lunchtime gets Atlanta's night
streets, because the streets ARE Atlanta's — EAV, Edgewood, Underground, Little
Five Points — and a game about a place runs on that place's clock. Night from
7pm Eastern.

It is a default, not a cage: TIME OF DAY offers `Atlanta time` (default),
`Always day`, `Always night` and `My local time`. See `timeOfDay()` /
`atlantaHour()` in `src/world/stages.js`.

### Visual style & background references

Backgrounds are **real Atlanta photos converted into a stylized night pixel-art look** — not invented/fictional scenes. Moody rain-slicked streets, warm interior/streetlight glow against a cool purple-blue night sky, dense pixel-level signage detail, a mix of real brands and real local spots. This is the definitive art direction for all 5 stage backgrounds — new environment art should be measured against these references.

4 reference background images were provided in development chat (not yet saved as files — see `assets/backgrounds/` convention below):

1. **EAV** — Citgo gas station / "Welcome To East Atlanta" wooden sign, Swifty Car Wash ("Ahead On Left · Join Any Club"), McDonald's Drive-Thru, pedestrian crossing signal, trees framing the sign.
2. **Edgewood** — "Colour Bar ATL" storefront: string lights, neon window signage ("COLOUR BAR ATL", "DIS ATL HOE"), "BLACK LIVES MATTER" signage, "SOUL FOOD & SPIRITS", brick facade, wet sidewalk reflections.
3. **Little 5 Points** — "Criminal Records" record shop storefront (a real Little 5 Points landmark): "NEW & USED", "BUY SELL TRADE", "OPEN" neon, a framed portrait poster, "RECORDS · TAPES · CDS", adjacent "Buy/Sell/Trade" pet shop signage.
4. **The Underground (5 Points)** — large arched "UNDERGROUND" transit-style entrance sign with marquee lighting, directional signage ("Midtown / Westside" ← , "East Point / Airport" →), a Coca-Cola disc sign, a Waffle House storefront, city skyline behind, rain-slicked plaza.

## Combos: chain them without landing

Client: *"can you add the combo counter into the game so it actually counts?
...or actually a combo system."*

**Consecutive stomps without touching the ground.** Land and the chain is over;
the run's best survives landing, dying and spending a continue. The HUD shows
`xN COMBO` from x2 up — x1 is just a stomp — and each link lays a chime a
semitone higher over the punch, which stays exactly as loud as it is at x1.

**The mechanic was already in the game; nothing was reading it.** A stomp
pogos the player off at vy -10.5 and hands back an air jump. That bounce alone
flies 40 ticks and carries **256px** at run speed, and the generator's
`MIN_ENEMY_SPACING_COLS` is 8 columns — **256px**. So a chain clears the
tightest spacing in the game *exactly*, before the free air jump is even spent.
Both numbers are measured by `tools/harness/combo.mjs`, not taken from the
constants. That is why the rule is "without landing" rather than a forgiving
timer: the arc already makes it barely possible, which is what a combo should
be. Enemies patrol ±170px, so pairs that drift together are the real openings.

### ⚠️ A combo is worth ZERO points, and that is a contest decision

Every score here is recomputed server-side and checked against a **measured**
ceiling (61,650 for a perfect run) with a refusal threshold at 70,000 and a
400-points-per-second rate check. A combo bonus would move the ceiling, re-open
the Will Hill calibration that the whole scoring table is built around, and —
the real risk — could get a genuinely great run **refused mid-contest as
`implausible-rate`**. The prize makes that unacceptable.

So the chain changes what a run *feels* like and what the dashboard can *say*
about it, and touches nothing that decides who wins. It surfaces as MAX COMBO
on the admin dashboard and as a lifetime best on the device. `combo.mjs` fails
if a chain ever moves the score by a single point — that check is the feature's
actual contract, not a nicety.

Points are a fine idea *after* the contest closes. See `docs/STATUS.md`.

## Enemy design

A single base enemy archetype in 3 palette variations, matching the background art's pixel style: masked figure (black balaclava/ski mask), hoodie (up), jeans, sneakers, clenched fists, menacing stance.

- **Variation A** — black hoodie, blue jeans
- **Variation B** — grey hoodie, blue jeans
- **Variation C** — brown/rust hoodie, dark grey jeans

**Confirmed:** the 3 palette variations are general enemy variety used across all 5 stages (not stage-locked). **No bosses** — unlike the Jandé game's 9 unique per-stage bosses, this masked enemy (in its 3 palette variants) is the full enemy roster.

### Note on "Street Ninja" concept sheets (archived, not in scope)

Two follow-up concept sheets were produced (one "ENEMY CONCEPT: STREET NINJA", one "PLAYER CONCEPT: STREET NINJA") showing a full fighting-game moveset — Will Hill: Jab/Roundhouse/Shoryuken/Flying Kick + hit reactions/knockdown; enemy: Attack 1/Attack 2/Throw + "overwhelm the player in groups" flavor text. **Confirmed this is generic template/generator output, not a design change** — the Mario-stomp-only, no-combat decision above stands. These sheets are useful only as visual style reference (art direction, palette, general idle/walk/hurt silhouette); the named attack moves are explicitly not in scope.

## Character asset pipeline

Chain already run by the user for Will Hill's player character:

`v2.png` (character reference render — stylized 3D toy-figure: backward-tilted red MLB cap, black glasses, beard, gold chain, oversized white tee, olive cargo pants, white sneakers, bracelets) → **Tripo3D** → `WILL HILL SPRTIE OBJ V2.obj` (490K verts / 981K faces, vertex-colored, no UVs, paper-thin in Z — a flat photo-relief mesh, a render source, not a riggable 3D character) → **autosprite.io** → `Will-Hill-spritesheet.zip` (39 animations, AutoSprite 3D format, 25-frame 5×5-grid sheets, 256×256 px cells, 1280×1280 px sheet, RGBA8888).

This differs from the Jandé game's chain (Blender + Hyper3D Rodin + manual rig) — Will Hill's pipeline is Tripo3D + AutoSprite.io end-to-end, no Blender rigging step. This is the established chain for any future Will Hill asset regeneration.

### Animation usage split

**Superseded.** The original chain above produced a 39-animation export whose
*named* clips (Sword Idle, Jog, Roll, Jump Start, Hit, Death, Punch, Kick...)
were all rendered from BEHIND — back of the cap, no face — and read as the
character running away from the player. A second pass used the export's
`iso_*_right` clips, which at least faced forward, but those are an isometric
3/4 projection: standing still, Will Hill's rear foot floated above the
pavement, because in that projection the far foot sits higher in frame. That
is not fixable in the renderer — sinking the sprite just buries the planted
foot.

**Current source — v1 SIDESCROLLER export.** Four clips, rendered as a flat 2D
side profile facing screen-right: `idle`, `walk`, `run`, `jump`. The renderer
mirrors them for left-facing movement, so the source facing matches its
un-flipped default. Both feet land on the same line.

Each sheet is 2560x2560: a 10x10 grid of 256x256 cells with 96 populated
frames (four cells unused). What each clip actually contains was measured, not
assumed, and the measurements decided the packing:

- **idle** runs THREE full breaths across its 96 frames. Playing all three per
  cycle at the first pass's 16-frames/4-ticks worked out at ~168 breaths a
  minute, which read as panting. Only ONE breath is taken (frames 0-31).
- **walk** and **run** are each one complete cycle.
- **jump** is NOT one jump. It is SEVEN separate hops (airborne runs at frames
  0-1, 10-14, 23-27, 36-41, 54-58, 68-72, 84-88). Sampling evenly across all
  of them put grounded and airborne poses side by side and made him flail.
  Only the longest clean arc is taken, 36-41.

**Composed game-ready spritesheet:** `src/assets/sprites/will-hill.webp` +
`will-hill.atlas.json`, built by `tools/compose_player_sheet.py`. Clips flow
end to end across a 16-wide grid rather than one row each, so every clip can
be its own length — a row-per-clip layout forces one frame count on all of
them, and that count is capped by texture width (at a 185px cell, 22 frames
already exceeds the 4096 limit older mobile GPUs enforce). Each animation
records the linear frame index it starts at; the renderer turns that back into
a row and column.

| clip | frames | ticks/frame | duration | why |
|---|---|---|---|---|
| idle | 32 | 7.5 | 4.00s | one breath, ~15 breaths/min |
| walk | 17 | 3.85 | 1.09s | one stride, ~55 strides/min |
| run | 10 | 3.0 | 0.50s | one stride, ~120 strides/min |
| jump | 6 | — | — | posed from vertical velocity, not timed |

**Every clip holds more cycles than it looks like.** Measured by
autocorrelation, not assumed: idle holds 3 breaths, walk 5.6 strides (cycle =
17 frames, seam 0.015), run 9.6 strides (cycle = 10, seam 0.037), and jump is
seven separate hops. Sampling evenly across a whole clip therefore plays every
one of those cycles per loop — the walk was doing 4.2 strides a second and read
as running in place. Take ONE cycle from each and time it to a real cadence.

Fractional tick rates are deliberate: they let a clip keep its exact original
duration while gaining frames, which is what makes it smoother rather than
merely slower. The jump is `driven` — the player picks the frame from `vy`
(0-1 rising, 2-3 apex, 4-5 falling) so the pose always matches the physics and
a long fall holds rather than loops.

Frames are trimmed from the 256x256 source cell to a shared **229x251** union
bounding box and saved as WebP q92 — visually indistinguishable from lossless
here and far smaller, since this is a photo-rendered character with fine
shading rather than flat pixel art. Imported in `src/entities/player.js` as
`PLAYER_SPRITE`.

**Ground contact.** The atlas declares `anchor: "low"`. (There is no longer a
`sink` key — ground contact is measured off the sprite instead of declared as a
constant.) The
isometric sheets anchor on the midpoint between the two feet, because a 3/4
projection draws the far foot well above the near one; a true side profile has
both feet level and anchors on the lowest pixel instead. But the midpoint
anchor also gave the isometric characters 1.4% of drawn height of extra sink
into the pavement for free, and without it Will Hill planted that much higher
than the enemies standing beside him. `sink` states it explicitly so both
plant at the same depth.

⚠️ **Twelve** engine animation keys now map onto **eight** source clips —
`idle, walk, jog, run, jumpStart, jumpLand, roll, hit, knockback, fall,
knockdown, death` (`KEY_MAP` in `tools/compose_player_sheet.py`). The reaction
clips (hit, downed, knockback, fall) are real captures now, not borrowed rows.
What follows describes the ORIGINAL four-row export and is kept for history:
`jog` shares `run`;
`jumpStart` and `jumpLand` share `jump`; and `roll`, `hit` and `death` borrow
rows because the export has no clip for them — `roll` reads as a dash on the
run row, `hit` (now played on a pothole trip) and `death` sit on idle. Proper
clips for those three are a follow-up.

⚠️ **Raw source is COMMITTED now — this said the opposite.** `git ls-files
assets/` returns 39 tracked files: nine `will-hill-pixel` sheets (downed, fall,
hit, idle, jump, knockback, perform, run, walk), twelve enemy sheets, the brand
files and the voice recording. `.gitignore` uses `/assets/*` plus negations
rather than a blanket ban, on the rule stated in CLAUDE.md: **if losing the
file means the work cannot be rebuilt, commit it.** A fresh clone CAN re-run
the compose script.

**Archived, not wired into the engine:** everything from the earlier 39-clip
export — the rear-view named animations, the 11 side-view combat clips
(`Sword Attack`, `Slash A/B/C`, `Combo`, `Kick`, `Punch`, ...) and the 20
`iso_*` directional clips. Kept because they are already generated and cheap
to keep; excluded because the game is a side-scroller and they either face
the wrong way or duplicate what the SIDESCROLLER export does better.

## Leaderboard & contest

The leaderboard is a real, load-bearing feature — not a someday-maybe. It runs a **3-day contest**; whoever tops the leaderboard receives a **real-world prize from Will Hill and his team**.

- **Score integrity:** replay/event validation. The client submits a compact run-event log (collectibles picked up + timing), not a bare trusted score number; the server recomputes the score from that log before accepting the entry. Meaningfully harder to spoof than a naive score-POST endpoint.
- **Fields captured per entry:** name, score (auto-logged from the validated event replay), phone, email.
- **Privacy — public/private split:** phone and email are collected for real-world prize contact only. They are stored server-side and **never** exposed on the public-facing leaderboard, which shows name + score only.
- **Contest window:** 3 days — start/end configured server-side, with a clean way to read off the final standings once the window closes.
- **UI/UX — mirrors the Jandé game's leaderboard presentation** (same on-screen pattern, not the same backend shape, which differs per the validation/contact-field requirements above): name entered once (persisted locally, not re-asked every run), a top-N list rendered on the end-of-run screen with the current player's row highlighted, and a silent graceful fallback to a local top-10 if the server is unreachable — no error shown to the player. Reference implementation: `once-upon-a-time/index.html` (`#overlay`/`#ovName`/`#ovBoard` markup, and `saveRun`/`lbSubmit`/`lbTop`/`fillGlobalBoard`). Phone/email are captured once via a separate lightweight contest-registration step, not as part of the per-run overlay, keeping that screen uncluttered.
- **Storage — Cloudflare D1, not KV.** ⚠️ This changed after the KV design was
  measured against the contest it has to survive. The board was a single KV key
  read-modified-written on every submit; KV has no compare-and-swap, so two
  players finishing together lost a score, and its ~1-write-per-second-per-key
  ceiling made a launch party a queue. D1 makes "keep the highest" a database
  guarantee — `ON CONFLICT(id) DO UPDATE SET score = MAX(runs.score, excluded.score)`.
  Schema in `cloudflare/schema.sql`; three tables, and the split is the point:
  `runs` is public and has no contact column at all, `entrants` holds phone and
  email, `seen_runs` refuses replays.
- **Read/write split:** `/top` is cached ~2s at the edge, `/submit` never. Reads
  are what scale (thousands), writes are not (hundreds).
- **Entering after a run counts.** The submit fires at the moment of death,
  before the contest is offered, so an unregistered run is HELD and flushed the
  instant they enter. It used to be discarded, which silently lost the most
  common path there is.
- **Anti-abuse:** origin-locked CORS, per-run replay ids, two honeypots (a hidden
  form field and a decoy `score` field the real client never sends), plausibility
  limits above the score recompute, fail-closed errors, and a logged reason for
  every refusal.
- **Admin dashboard:** `cloudflare/dashboard-worker.js` — a SEPARATE worker on a
  separate hostname, read-only on the same database, reached by a rotatable
  token in the link with no login. Full entrant list with contact details, live,
  plus CSV export. Deliberately not an `/admin` route on the game worker, which
  is the thing every phone is hammering and the thing an attacker already has a
  URL for.
- **Implementation status:** written and committed, **not deployed**. Creating
  the D1 database and deploying both workers touches the live Cloudflare
  account and stays a manual, explicitly-confirmed step. `LB_BASE` in
  `src/net/leaderboard.js` is empty until then, and the game shows a local
  board rather than an error.

## Open items / next steps

- Save the 4 background reference images and 3 enemy/"Street Ninja" concept sheets out of chat and into `assets/backgrounds/<stage>/` and `assets/enemies/` respectively.
- Landmark research pass for each of the 4 stages (confirm exact real-world layout/reference points beyond the images already provided).
- Design the run-event log format for leaderboard score validation, shared between `src/net/leaderboard.js` and `cloudflare/leaderboard-worker.js`.
- Decide contest start/end timestamps once launch is scheduled.
- Actually create the Cloudflare KV namespace and deploy the Worker (manual step, confirm before running).
