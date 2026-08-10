# tools/

- **`deploy.sh`** — builds via Vite and publishes `dist/` to a freshly-rebuilt `gh-pages` orphan branch. Refuses to run from `gh-pages` or a detached HEAD. Never uses `git add -A` on the deploy branch (see `CLAUDE.md` for why that guardrail exists).
- **`compose_player_sheet.py`** — packs Will Hill's 9 in-scope animations (see `docs/GDD.md` → "Character asset pipeline") from `assets/raw-sprites/will-hill/` (git-ignored raw AutoSprite export) into `src/assets/sprites/will-hill.png` + `will-hill.atlas.json`, a single game-ready spritesheet Vite hashes and bundles. Analogous to the Jandé project's `tools/compose_bosses.py`. Requires Pillow (`pip install pillow`); re-run it any time the raw source frames change:
  ```bash
  python tools/compose_player_sheet.py
  ```
