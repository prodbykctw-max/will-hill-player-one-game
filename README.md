# Will Hill: Player One

**Play it free: https://prodbykctw-max.github.io/will-hill-player-one-game/**

A side-scrolling runner game starring Atlanta rapper [Will Hill](https://realwillhill.com/), making his way through five Atlanta stops — East Atlanta Village, Edgewood, The Underground (5 Points), Little 5 Points and Buckhead Theatre — to his show, to his own music. Collect money bags, stomp enemies from above, and grab champagne for 9 seconds of invincibility and double bags. Top scores go on the contest leaderboard. Developed by Rare Agency.

Full design details live in [`docs/GDD.md`](docs/GDD.md) — the source of truth for mechanics, stages, art direction, and the leaderboard/contest design. Current state of the project: [`docs/STATUS.md`](docs/STATUS.md).

## How to play

| action | keyboard | touch |
|---|---|---|
| move | ← → or A / D | on-screen pads |
| jump | Space, ↑ or W | on-screen pad |
| dash | Shift or X | on-screen pad |

Touch pads appear only on touch devices (`src/core/input.js`).

- **Money bags** are the score. Money in hand is **banked** each time you cross a stage's finish line.
- **Enemies:** jumping on top of one defeats it; touching one from the side knocks your unbanked money loose (recoverable) and costs a heart. Potholes trip you and cost a heart but keep your money. Three hearts.
- **Champagne:** 9 seconds of invulnerability and 2x bags (`CHAMPAGNE_SECONDS`, `src/entities/player.js`).
- Will Hill's intro bubbles teach the controls at the start of stage one.
- **Time of day** follows Atlanta's clock (America/New_York) by default; the settings panel also offers always day, always night and the device's local time (`src/world/stages.js`).
- The music is Will Hill's four instrumentals (`src/assets/music/will-hill/`), plus his recorded voice lines (`src/assets/voice/`).

## Stack

- Vanilla JS + Canvas 2D, bundled with [Vite](https://vitejs.dev/) 5
- Production builds include a generated service worker (`sw.js`, written by `vite.config.js`): content-hashed assets are cache-first, everything else network-first. The build also strips HTML and inline-CSS comments from `index.html`.
- Deployed to GitHub Pages via `tools/deploy.sh` (orphan `gh-pages` branch)
- Leaderboard backend: Cloudflare Workers + D1 (`cloudflare/`), deployed. The game posts to `https://will-hill-leaderboard.prodbykctw.workers.dev` (`LB_BASE` in `src/net/leaderboard.js`).

## Project structure

```
index.html      # page shell, UI markup and styles
src/
  main.js       # bootstraps canvas + game loop, screens, scoring, service worker registration
  core/         # loop, input, camera, physics, haptics, relay (dev walkthrough mode)
  entities/     # player, enemies, collectibles, knockdown
  world/        # stage data for the 5 stages, generator, tilemap, tutorial
  render/       # canvas rendering (backdrops, HUD, title, ending, MARTA map, credits)
  audio/        # sound effects and music
  net/          # leaderboard + contest registration client
  ui/           # leaderboard / contest / settings panel, share card
  assets/       # game-ready art, audio, music and voice (hashed into dist/ by Vite)
public/         # manifest, icons, share card, llms.txt, sitemap (copied as-is)
tools/          # deploy scripts, asset pipeline scripts, harness/ (Playwright checks)
cloudflare/     # leaderboard + dashboard Workers, D1 schema and migrations (deployed)
docs/           # GDD.md, STATUS.md, TESTING.md, and other project records
assets/         # mostly git-ignored raw art; a selected set is committed (sprite sheets, brand, refs, UI concepts, a voice source)
```

## Dev

```bash
npm install
npm run dev      # local dev server
npm run build    # production build -> dist/
npm run preview  # serve the production build
```

Dev-only URL flags (see `CLAUDE.md`): `?relay=1`, `?stage=1..5`, `?tod=day|night`, and `?lb=<url>` (dev build only).

Browser checks live in `tools/harness/` and run against the dev server; see [`docs/TESTING.md`](docs/TESTING.md) for setup and what each one covers.

## Deploy

```bash
bash tools/deploy.sh
```

Builds via Vite and publishes `dist/` to a freshly-rebuilt `gh-pages` orphan branch, assembled in a throwaway directory that holds only build output. It carries recent previous deploys' hashed assets forward (`tools/deploy_union.py`) so a cached `index.html` keeps working, and refuses to publish if source-looking paths appear. See [`tools/README.md`](tools/README.md) for details and guardrails — **never `git add -A` on the deploy branch.**

The Workers deploy separately: `tools/deploy_backend.sh` (or `.ps1`) migrates D1 and then deploys both Workers; it asks before touching the live account. See [`cloudflare/README.md`](cloudflare/README.md).

## Character asset pipeline

Will Hill's sprite chain: character reference render → Tripo3D (3D render source) → autosprite.io (2D spritesheet export). Details and the current animation in/out-of-scope split are in `docs/GDD.md` under "Character asset pipeline". The raw per-animation sheets are committed under `assets/raw-sprites/`; `tools/compose_player_sheet.py` and `tools/compose_enemy_sheet.py` pack them into the game-ready sheets in `src/assets/sprites/`.
