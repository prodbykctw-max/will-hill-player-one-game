# tools/

- **`deploy.sh`** — builds via Vite and publishes `dist/` to a freshly-rebuilt `gh-pages` orphan branch. Refuses to run from `gh-pages` or a detached HEAD. Never uses `git add -A` on the deploy branch (see `CLAUDE.md` for why that guardrail exists).
- **`compose_player_sheet.py`** — packs Will Hill's 9 in-scope animations (see `docs/GDD.md` → "Character asset pipeline") from `assets/raw-sprites/will-hill/` (git-ignored raw AutoSprite export) into `src/assets/sprites/will-hill.webp` + `will-hill.atlas.json`, a single game-ready spritesheet Vite hashes and bundles. Trims each frame to the shared union bounding box and saves as quality-92 WebP (0.86MB vs. an untrimmed lossless PNG's 3.8MB, no visible quality loss). Analogous to the Jandé project's `tools/compose_bosses.py`. Requires Pillow (`pip install pillow`); re-run it any time the raw source frames change:
  ```bash
  python tools/compose_player_sheet.py
  ```
