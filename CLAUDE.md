# CLAUDE.md — Will Hill: Player One

Architecture and conventions for working on this repo. Read `docs/GDD.md` first for game design; this file is about how the code/repo is organized.

## Guardrail — read this first

**NEVER `git add -A` on the `gh-pages` deploy branch.** A past project in this workspace (`once-upon-a-time` / Jandé) leaked real reference photos and an account cache onto a public branch this exact way; its history had to be purged via an orphan force-push. `tools/deploy.sh` stages explicit paths only and rebuilds `gh-pages` as a fresh orphan every run — don't bypass it with a manual `git add -A` + push.

## Architecture

- **Modular `src/` + Vite build**, not a single hand-maintained HTML file. Chosen specifically to avoid the dead-parked-experiment drift that accumulated in the Jandé repo (a Phaser+Vite scaffold and two Godot projects sat unused alongside its real single-file source). One source tree, one build target (`dist/`).
- Vite's asset import system content-addresses (hashes) imported assets automatically — this replaces the hand-rolled `externalize_assets.py` content-addressing step the Jandé project needed.
- `assets/` (raw reference art, 3D source files, AutoSprite/Tripo3D exports) is git-ignored — never commit real source assets. Composed/game-ready assets are imported into `src/` and end up hashed in `dist/` at build time.

## Process this repo follows

This project follows the `game-dev-pipeline` skill (`~/.claude/skills/game-dev-pipeline/SKILL.md`) — a reusable 5-phase process (Concept & Style → Environment/World → Tooling & MCP selection → Repo Scaffold → Asset Pipeline & Deploy) developed alongside this repo's own scaffold and meant to apply to future game projects too.

## Leaderboard/backend

The contest leaderboard (`cloudflare/leaderboard-worker.js`) is real, load-bearing scope — see `docs/GDD.md` "Leaderboard & contest" for the full design (replay/event-log score validation, public name+score / private phone+email split, 3-day contest window). Its Cloudflare KV namespace has not been created and it has not been deployed — that's an explicitly-confirmed manual step, not something to run automatically.

## Reference project

`C:\Users\Owner\Documents\once-upon-a-time` (the Jandé game) is the sibling project this one borrows proven patterns from — deploy script shape, `.gitignore` conventions, leaderboard UI/UX pattern (`#overlay`/`#ovName`/`#ovBoard`, `saveRun`/`lbSubmit`/`lbTop`/`fillGlobalBoard` in its `index.html`). When in doubt about a convention, check there first before inventing a new one.
