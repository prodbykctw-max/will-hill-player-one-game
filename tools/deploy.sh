#!/usr/bin/env bash
# Deploy Will Hill: Player One to GitHub Pages.
#
# Adapted from the Jandé project's tools/deploy.sh guardrails:
#   - refuses to run from gh-pages or a detached HEAD
#   - rebuilds gh-pages as a fresh ORPHAN branch every run
#   - publishes only dist/ (built output) — never source, never git add -A
#
# NEVER `git add -A` on the deploy branch. See CLAUDE.md for why.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

CURRENT_BRANCH="$(git symbolic-ref --short -q HEAD || echo "")"
if [ -z "$CURRENT_BRANCH" ]; then
  echo "Refusing to deploy from a detached HEAD." >&2
  exit 1
fi
if [ "$CURRENT_BRANCH" = "gh-pages" ]; then
  echo "Refusing to deploy from gh-pages itself — switch to your dev branch first." >&2
  exit 1
fi

echo "Building..."
npm run build

echo "Publishing dist/ to a fresh gh-pages orphan branch..."
WORKTREE_DIR="$(mktemp -d)"
git worktree add --detach "$WORKTREE_DIR" 2>/dev/null || git worktree add "$WORKTREE_DIR" --detach

pushd "$WORKTREE_DIR" > /dev/null
git checkout --orphan gh-pages
git reset --hard
cp -r "$REPO_ROOT"/dist/. .
touch .nojekyll
git add index.html assets .nojekyll 2>/dev/null || git add . # explicit paths where possible; dist/ output only, never source
git commit -m "Deploy $(date -u +%Y-%m-%dT%H:%M:%SZ)"
git push origin gh-pages --force
popd > /dev/null

git worktree remove "$WORKTREE_DIR" --force

echo "Deployed. Enable GitHub Pages on the gh-pages branch in repo settings if not already."
