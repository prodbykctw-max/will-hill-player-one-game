# Will Hill: Player One

A side-scroll platformer built in the style of the Jandé game's Action RPG mode, starring Will Hill making his way through four real Atlanta neighborhoods to his performance — collecting money bags, dodging (or stomping) street enemies, and grabbing champagne bottles for temporary invulnerability.

Full design details live in [`docs/GDD.md`](docs/GDD.md) — read that first, it's the source of truth for mechanics, stages, art direction, and the leaderboard/contest design.

## Stack

- Vanilla JS + Canvas 2D, bundled with [Vite](https://vitejs.dev/)
- Deployed to GitHub Pages via `tools/deploy.sh` (orphan `gh-pages` branch)
- Leaderboard backend: Cloudflare Worker + KV (`cloudflare/`) — see [`cloudflare/README.md`](cloudflare/README.md) for deploy status

## Project structure

```
src/
  main.js       # bootstraps canvas + game loop
  core/         # loop, input, camera
  entities/     # player, enemies
  world/        # map/level data for the 5 stages
  render/       # canvas rendering
  audio/
  net/          # leaderboard client
tools/          # deploy script + pipeline docs
cloudflare/     # leaderboard Worker (code scaffolded, not yet deployed)
docs/           # GDD.md — the living design doc
assets/         # git-ignored — raw reference art, 3D source, AutoSprite exports (not committed)
```

## Dev

```bash
npm install
npm run dev      # local dev server
npm run build    # production build -> dist/
```

## Deploy

```bash
bash tools/deploy.sh
```

Builds via Vite and publishes `dist/` to a freshly-rebuilt `gh-pages` orphan branch. See [`tools/README.md`](tools/README.md) for details and guardrails — **never `git add -A` on the deploy branch.**

## Character asset pipeline

Will Hill's sprite chain: character reference render → Tripo3D (3D render source) → autosprite.io (2D spritesheet export). Details and the current animation in/out-of-scope split are in `docs/GDD.md` under "Character asset pipeline". Raw exports live locally in git-ignored `assets/` — not committed.
