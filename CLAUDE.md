# CLAUDE.md — Will Hill: Player One

Architecture and conventions for working on this repo. Read `docs/GDD.md` first for game design; this file is about how the code/repo is organized.

## Guardrail — read this first

**NEVER `git add -A` on the `gh-pages` deploy branch.** A past project in this workspace (`once-upon-a-time` / Jandé) leaked real reference photos and an account cache onto a public branch this exact way; its history had to be purged via an orphan force-push. `tools/deploy.sh` stages explicit paths only and rebuilds `gh-pages` as a fresh orphan every run — don't bypass it with a manual `git add -A` + push.

## Architecture

- **Modular `src/` + Vite build**, not a single hand-maintained HTML file. Chosen specifically to avoid the dead-parked-experiment drift that accumulated in the Jandé repo (a Phaser+Vite scaffold and two Godot projects sat unused alongside its real single-file source). One source tree, one build target (`dist/`).
- Vite's asset import system content-addresses (hashes) imported assets automatically — this replaces the hand-rolled `externalize_assets.py` content-addressing step the Jandé project needed.
- `assets/` (raw reference art, 3D source, AutoSprite/Tripo3D exports) is ignored **by default, not by rule**. The point is to stop unwanted *exposure*, not to block recordkeeping — a blanket ban was losing irreplaceable work. The test: **if losing the file means the work cannot be rebuilt, commit it.** Currently kept: **39 tracked files** — nine `will-hill-pixel` sheets (downed, fall, hit, idle, jump, knockback, perform, run, walk), twelve enemy sheets (enemy_a/b/c × defeat/idle/stomp/walk), the brand files and prodbyKCTW's voice recording. Re-downloadable packs and build scratch stay ignored. (This said "the four SIDESCROLLER sprite sheets" long after the reaction clips and every enemy sheet were added — `git ls-files assets/ | wc -l` is the check.) See `.gitignore` for the negation pattern (`/assets/*`, not `/assets/` — git will not descend into an excluded directory). Composed game-ready assets live in `src/` and are hashed into `dist/` at build time.

- **`public/bench/` is generated, never committed** (`.gitignore` has it).
  `tools/build_loopbench.py` writes it from `tools/loopbench.html` plus the
  loops in `src/assets/music/`, and `tools/deploy.sh` publishes it at `/bench/`
  along with the game. Two things it does deliberately: it serves the SHIPPED
  loops rather than re-rendering the client's master tracks, so the bench adds
  nothing to what is public (`--master <slot>` opts one cue out of that, for
  when a loop needs to get *longer*); and it strips the comments out of the
  published copy, because `vite.config.js`'s stripper only ever sees
  `index.html` and these ones quote the client word for word.

## Process this repo follows

This project follows the `game-dev-pipeline` skill (`~/.claude/skills/game-dev-pipeline/SKILL.md`) — a reusable 5-phase process (Concept & Style → Environment/World → Tooling & MCP selection → Repo Scaffold → Asset Pipeline & Deploy) developed alongside this repo's own scaffold and meant to apply to future game projects too. ⚠️ That one lives on the client's own machine, NOT in this repo, so a container cannot read or update it — anything learned that belongs there has to be handed over deliberately.

### Skills this repo owns (`.claude/skills/`, versioned with the code)

Written FROM this project's mistakes, and kept in the repo so they travel with it:

- **`backdrop-multiplane`** — cutting a flat plate into parallax cards, and everything the clouds took a week to teach: why a card is wholly in front or wholly behind, why a blue sky flood runs down a building's shadowed face, how to tell a stone pier from a cloud, and why sealing too much kills the weather.
- **`game-harness`** — measuring a running game without lying to yourself. Deterministic frame capture, noise floors, master-bus audio (never `!el.paused`), polling instead of sleeping, and how to tell a harness bug from a product bug. Read this BEFORE writing a new check.
- **`contest-leaderboard`** — a leaderboard with a real prize on it: identity, server-side score validation, why KV lost scores and D1 does not, entry-flow ordering, the anti-abuse layers, and the separate admin dashboard.

When one of these is proved wrong or incomplete by new work, update the skill in the same commit as the fix. A skill that documents a superseded decision is worse than no skill.

## Leaderboard/backend

The contest leaderboard is real, load-bearing scope — see `docs/GDD.md` "Leaderboard & contest" for the full design (replay/event-log score validation, public name+score / private phone+email split, 3-day contest window).

**It runs on Cloudflare D1, not KV.** ⚠️ The KV design is gone and should not come back: the whole board lived in one key, read-modified-written per submit, and KV has no compare-and-swap — two players finishing together lost a score, with a prize attached. D1 makes "keep the highest" an atomic upsert. Schema in `cloudflare/schema.sql`.

Two workers, deliberately separate:
- `cloudflare/leaderboard-worker.js` — public. Serves `/top` (cached 2s) and takes `/submit` (never cached). Origin-locked, replay-protected, honeypotted.
- `cloudflare/dashboard-worker.js` — the admin view, its own hostname, read-only, reached by a rotatable token in the link. Never fold this into the game worker: that is the endpoint under load and the one an attacker already has a URL for.

Neither is deployed. Creating the D1 database and deploying touches the live Cloudflare account and stays an explicitly-confirmed manual step, not something to run automatically. `LB_BASE` in `src/net/leaderboard.js` is empty until it is.

## Docs, and the dev doors

`docs/` is the written record and each file has one job:

| file | what it is for |
|---|---|
| `STATUS.md` | **start here.** Everything shipped, open, undone, on hold, and who is blocked |
| `TESTING.md` | how to run the harness suite, what each one protects, and the on-device checklist |
| `GDD.md` | the design — mechanics, scoring, the contest |
| `LESSONS.md` | mistakes already made here, so they are not made twice |
| `TECHNIQUES.md` | reusable methods |
| `HANDOFF.md` | the long-form running log |

**Dev URL flags** — URL only, never a button, nothing a player is ever shown:
`?relay=1` (CHAMPAGNE RELAY: no enemies, no pit deaths, aura always lit),
`?stage=1..4` (one-indexed; out of range falls through to stage one),
`?tod=day|night`, and `?lb=<url>` which is **DEV-build only** and folded to
dead code by Vite in production. `tools/harness/stageflag.mjs` grades both that
they work and that a plain URL is still the player's game.

## Reference project

`C:\Users\Owner\Documents\once-upon-a-time` (the Jandé game) is the sibling project this one borrows proven patterns from — deploy script shape, `.gitignore` conventions, leaderboard UI/UX pattern (`#overlay`/`#ovName`/`#ovBoard`, `saveRun`/`lbSubmit`/`lbTop`/`fillGlobalBoard` in its `index.html`). When in doubt about a convention, check there first before inventing a new one.
