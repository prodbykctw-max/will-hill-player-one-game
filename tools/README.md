# tools/

- **`deploy.sh`** — builds via Vite and publishes `dist/` to a freshly-rebuilt `gh-pages` orphan branch. Refuses to run from `gh-pages` or a detached HEAD. Never uses `git add -A` on the deploy branch (see `CLAUDE.md` for why that guardrail exists).

## Asset pipeline (planned, not yet built)

Once real asset production starts, this is where a compose step will live — analogous to the Jandé project's `tools/compose_bosses.py`: pack the in-scope Will Hill animations (see `docs/GDD.md` → "Character asset pipeline") from the raw AutoSprite export in `assets/` into a single game-ready spritesheet under `src/` for Vite to hash and bundle. Not implemented yet — this scaffold only documents where it goes.
