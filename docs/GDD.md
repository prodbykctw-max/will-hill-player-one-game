# Will Hill: Player One — Game Design Document

**Status: living document, comprehensive as of 2026-08-10 — not a locked spec.** This captures every design decision confirmed in development conversation so far. Update it as the design evolves; don't let decisions live only in chat history.

## Story & core loop

Will Hill is on his way to his performance — the run through the game's stages *is* him making his way to the show.

- **Collectible/currency token:** money bags. "Collect the bag" is the core objective/scoring loop.
- **Power-up:** champagne bottles — grant **30 seconds of invulnerability** on pickup.
- **Combat:** none. No sword/melee system.
- **Core mechanic — Mario-style stomp:** jumping on top of an enemy defeats it. Side/head-on contact damages the player instead.
- **Platforming:** platforms are asphalt-textured (visually distinct street/road material within the level geometry).
- **Enemy behavior & physics — confirmed "exactly like Mario":** classic bounded patrol AI (enemies walk back and forth within a range, or off ledges Goomba-style), standard platformer physics (gravity/jump arc, solid ground + floating platforms, pits/gaps as hazards). This is the well-understood Mario ruleset transplanted onto the Atlanta setting — no novel mechanic being invented.
- **Camera:** pulled back further than a typical side-scroller, with extra headroom so the player can see upcoming obstacles, platforms, and enemies before reaching them. Same rationale as a Mario-style camera looking ahead of the player, just pulled back further.
- **Movement/perspective:** side-scroll, in the same style as the Jandé game's Action RPG mode (`once-upon-a-time` repo) — explicitly **not** a Streets-of-Rage-style brawler (an earlier framing that was corrected) and **not** isometric (an isometric animation set exists but is unused — see Character Asset Pipeline below).

## Setting: Atlanta, 4 stages

Four stages, each a real Atlanta neighborhood, rendered as an exact-replica map using real landmarks — in the visual/structural spirit of *Michael Jordan: Chaos in the Windy City* (SNES beat-'em-up built around a real-city map; referenced for its real-city-map structure only, not its combat system), with a gritty 90s tone.

1. **East Atlanta Village (EAV)**
2. **Edgewood**
3. **Little 5 Points**
4. **The Underground (5 Points)**

### Visual style & background references

Backgrounds are **real Atlanta photos converted into a stylized night pixel-art look** — not invented/fictional scenes. Moody rain-slicked streets, warm interior/streetlight glow against a cool purple-blue night sky, dense pixel-level signage detail, a mix of real brands and real local spots. This is the definitive art direction for all 4 stage backgrounds — new environment art should be measured against these references.

4 reference background images were provided in development chat (not yet saved as files — see `assets/backgrounds/` convention below):

1. **EAV** — Citgo gas station / "Welcome To East Atlanta" wooden sign, Swifty Car Wash ("Ahead On Left · Join Any Club"), McDonald's Drive-Thru, pedestrian crossing signal, trees framing the sign.
2. **Edgewood** — "Colour Bar ATL" storefront: string lights, neon window signage ("COLOUR BAR ATL", "DIS ATL HOE"), "BLACK LIVES MATTER" signage, "SOUL FOOD & SPIRITS", brick facade, wet sidewalk reflections.
3. **Little 5 Points** — "Criminal Records" record shop storefront (a real Little 5 Points landmark): "NEW & USED", "BUY SELL TRADE", "OPEN" neon, a framed portrait poster, "RECORDS · TAPES · CDS", adjacent "Buy/Sell/Trade" pet shop signage.
4. **The Underground (5 Points)** — large arched "UNDERGROUND" transit-style entrance sign with marquee lighting, directional signage ("Midtown / Westside" ← , "East Point / Airport" →), a Coca-Cola disc sign, a Waffle House storefront, city skyline behind, rain-slicked plaza.

## Enemy design

A single base enemy archetype in 3 palette variations, matching the background art's pixel style: masked figure (black balaclava/ski mask), hoodie (up), jeans, sneakers, clenched fists, menacing stance.

- **Variation A** — black hoodie, blue jeans
- **Variation B** — grey hoodie, blue jeans
- **Variation C** — brown/rust hoodie, dark grey jeans

**Confirmed:** the 3 palette variations are general enemy variety used across all 4 stages (not stage-locked). **No bosses** — unlike the Jandé game's 9 unique per-stage bosses, this masked enemy (in its 3 palette variants) is the full enemy roster.

### Note on "Street Ninja" concept sheets (archived, not in scope)

Two follow-up concept sheets were produced (one "ENEMY CONCEPT: STREET NINJA", one "PLAYER CONCEPT: STREET NINJA") showing a full fighting-game moveset — Will Hill: Jab/Roundhouse/Shoryuken/Flying Kick + hit reactions/knockdown; enemy: Attack 1/Attack 2/Throw + "overwhelm the player in groups" flavor text. **Confirmed this is generic template/generator output, not a design change** — the Mario-stomp-only, no-combat decision above stands. These sheets are useful only as visual style reference (art direction, palette, general idle/walk/hurt silhouette); the named attack moves are explicitly not in scope.

## Character asset pipeline

Chain already run by the user for Will Hill's player character:

`v2.png` (character reference render — stylized 3D toy-figure: backward-tilted red MLB cap, black glasses, beard, gold chain, oversized white tee, olive cargo pants, white sneakers, bracelets) → **Tripo3D** → `WILL HILL SPRTIE OBJ V2.obj` (490K verts / 981K faces, vertex-colored, no UVs, paper-thin in Z — a flat photo-relief mesh, a render source, not a riggable 3D character) → **autosprite.io** → `Will-Hill-spritesheet.zip` (39 animations, AutoSprite 3D format, 25-frame 5×5-grid sheets, 256×256 px cells, 1280×1280 px sheet, RGBA8888).

This differs from the Jandé game's chain (Blender + Hyper3D Rodin + manual rig) — Will Hill's pipeline is Tripo3D + AutoSprite.io end-to-end, no Blender rigging step. This is the established chain for any future Will Hill asset regeneration.

### Animation usage split

**In scope (9 side-view animations) — composed and ready:**
- `Sword Idle` → `idle` — functions as the base walk/idle loop (frames show a walking bob, not a sword stance; "Sword" is just AutoSprite's preset label, not indicative of function)
- `Jog`, `Sprint Enter` → `sprintEnter`, `Sprint Exit` → `sprintExit`, `Roll`, `Jump Start` → `jumpStart`, `Jump Land` → `jumpLand`, `Hit`, `Death`

**Composed game-ready spritesheet:** `src/assets/sprites/will-hill.webp` + `will-hill.atlas.json` (9 rows × 24 frames — each source sheet's 25th frame duplicates frame 0 as a loop-closer, so it's dropped). Frames are trimmed from the original 256×256 AutoSprite cell down to a shared 184×224 union bounding box, then saved as WebP at quality 92 — visually indistinguishable from lossless but ~4x smaller than the original PNG (3.8MB → 0.86MB). Built by `tools/compose_player_sheet.py` from the raw export in `assets/raw-sprites/will-hill/` (git-ignored); re-run that script any time the source frames change. Imported in `src/entities/player.js` as `PLAYER_SPRITE`.

**Archived, not wired into the engine (11 side-view animations):**
`Sword Attack`, `Sword Block`, `Sword Enter`, `Sword Exit`, `Slash A`, `Slash B`, `Slash C`, `Combo`, `Kick`, `Punch` — kept in the raw asset export (already generated, cheap to keep) but excluded from the composed game-ready spritesheet.

**Archived, not wired into the engine (20 isometric animations):**
`iso_idle` / `iso_walk` / `iso_run` / `iso_jump`, each × 5 directions (down/up/right/northeast/southeast, all `_right`-suffixed — presumably meant to mirror for left-facing). Confirmed unused: the game's perspective is side-scroll, not isometric.

## Leaderboard & contest

The leaderboard is a real, load-bearing feature — not a someday-maybe. It runs a **3-day contest**; whoever tops the leaderboard receives a **real-world prize from Will Hill and his team**.

- **Score integrity:** replay/event validation. The client submits a compact run-event log (collectibles picked up + timing), not a bare trusted score number; the server recomputes the score from that log before accepting the entry. Meaningfully harder to spoof than a naive score-POST endpoint.
- **Fields captured per entry:** name, score (auto-logged from the validated event replay), phone, email.
- **Privacy — public/private split:** phone and email are collected for real-world prize contact only. They are stored server-side and **never** exposed on the public-facing leaderboard, which shows name + score only.
- **Contest window:** 3 days — start/end configured server-side, with a clean way to read off the final standings once the window closes.
- **UI/UX — mirrors the Jandé game's leaderboard presentation** (same on-screen pattern, not the same backend shape, which differs per the validation/contact-field requirements above): name entered once (persisted locally, not re-asked every run), a top-N list rendered on the end-of-run screen with the current player's row highlighted, and a silent graceful fallback to a local top-10 if the server is unreachable — no error shown to the player. Reference implementation: `once-upon-a-time/index.html` (`#overlay`/`#ovName`/`#ovBoard` markup, and `saveRun`/`lbSubmit`/`lbTop`/`fillGlobalBoard`). Phone/email are captured once via a separate lightweight contest-registration step, not as part of the per-run overlay, keeping that screen uncluttered.
- **Implementation status:** `cloudflare/leaderboard-worker.js` has real endpoint/validation logic scaffolded. Its KV namespace has **not** been created and it has **not** been deployed — that's a manual, explicitly-confirmed follow-up step (it touches the live Cloudflare account), same split the Jandé project used.

## Open items / next steps

- Save the 4 background reference images and 3 enemy/"Street Ninja" concept sheets out of chat and into `assets/backgrounds/<stage>/` and `assets/enemies/` respectively.
- Landmark research pass for each of the 4 stages (confirm exact real-world layout/reference points beyond the images already provided).
- Design the run-event log format for leaderboard score validation, shared between `src/net/leaderboard.js` and `cloudflare/leaderboard-worker.js`.
- Decide contest start/end timestamps once launch is scheduled.
- Actually create the Cloudflare KV namespace and deploy the Worker (manual step, confirm before running).
