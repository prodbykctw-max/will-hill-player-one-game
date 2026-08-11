#!/usr/bin/env bash
# Deploy Will Hill: Player One to GitHub Pages.
#
# GUARDRAIL — read this before changing anything here.
# The Jandé project leaked real reference photos onto a public branch via a
# `git add -A` on its deploy branch. The defence used there was "stage
# explicit paths", but that still relies on getting the paths right every
# time, and it degrades badly if a fallback ever fires.
#
# This script removes the possibility instead of policing it: the commit is
# built in a throwaway directory that contains a fresh `git init` and NOTHING
# but the contents of dist/. There is no source in that directory, so no
# add pattern — explicit, wildcard or accidental — can publish source. The
# project repo's own git state is never touched (no worktree, no branch
# switch, no orphan checkout in-place).
#
# Publishes: dist/ (Vite build output) -> gh-pages, force-pushed.

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

REMOTE_URL="$(git remote get-url origin)"
if [ -z "$REMOTE_URL" ]; then
  echo "No 'origin' remote configured." >&2
  exit 1
fi

echo "Building..."
npm run build

if [ ! -f "$REPO_ROOT/dist/index.html" ]; then
  echo "Build produced no dist/index.html — refusing to publish." >&2
  exit 1
fi

STAGE_DIR="$(mktemp -d)"
trap 'rm -rf "$STAGE_DIR"' EXIT

echo "Staging dist/ in a clean directory ($STAGE_DIR)..."
cp -r "$REPO_ROOT"/dist/. "$STAGE_DIR"/
touch "$STAGE_DIR/.nojekyll"   # keep Pages from running Jekyll over the output

# Belt and braces: prove there is no source in what we're about to publish.
if [ -e "$STAGE_DIR/src" ] || [ -e "$STAGE_DIR/assets/raw-sprites" ] || [ -e "$STAGE_DIR/tools" ]; then
  echo "Source-looking paths found in the staging dir — refusing to publish." >&2
  exit 1
fi

cd "$STAGE_DIR"
git init -q
git checkout -q -b gh-pages
git add .            # safe by construction: this directory only ever holds dist/ output
git -c user.email="deploy@local" -c user.name="deploy" \
    commit -q -m "Deploy $(date -u +%Y-%m-%dT%H:%M:%SZ)"
git remote add origin "$REMOTE_URL"
git push -q --force origin gh-pages

echo "Deployed to gh-pages."
echo "If Pages isn't enabled yet:"
echo "  gh api -X POST repos/:owner/:repo/pages -f source[branch]=gh-pages -f source[path]=/"
