# Will Hill: Player One

**Play it free: https://prodbykctw-max.github.io/will-hill-player-one-game/**

A side-scrolling runner game starring Atlanta rapper [Will Hill](https://realwillhill.com/), making his way through five Atlanta stops — East Atlanta Village, Edgewood, The Underground (Five Points), Little 5 Points and Buckhead Theatre — to his show, to his own music. Collect money bags, stomp or dash past street enemies, and grab champagne for 9 seconds of invincibility and double bags. Top scores go on the contest leaderboard. Developed by Rare Agency.

Full design details live in [`docs/GDD.md`](docs/GDD.md) — read that first, it's the source of truth for mechanics, stages, art direction, and the leaderboard/contest design.

## Stack

- Vanilla JS + Canvas 2D, bundled with [Vite](https://vitejs.dev/)
- Deployed to GitHub Pages via `tools/deploy.sh` (orphan `gh-pages` branch)
- Leaderboard backend: Cloudflare Workers + D1 (`cloudflare/`), deployed

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
cloudflare/     # leaderboard + dashboard Workers (deployed)
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
