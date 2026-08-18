#!/usr/bin/env bash
# Migrate the contest database, then deploy both Cloudflare workers — in that
# order, with the order enforced rather than remembered.
#
# WHY THIS SCRIPT EXISTS AT ALL. Deploying the backend is three commands whose
# ORDER is load-bearing, and getting it wrong is not a build error, it is a
# live contest looking broken:
#
#   * Dashboard worker deployed before the database has the column its query
#     names -> his artwork still loads, every number stays blank, and the
#     clock reads HTTP 500. Recoverable in seconds, but only if you know why.
#   * Game worker deployed first -> milder and worse. Scores keep saving (the
#     stats block is inside a try/catch on purpose), so nothing looks wrong,
#     while every run played in that window silently loses its stats row
#     FOREVER. Two runs were already lost that way once.
#
# So the migration goes first, and this script refuses to deploy anything
# until it has SEEN the column in the live schema. Not "the command exited
# zero" — read back from the database.
#
# ⚠️ IT TOUCHES THE LIVE CONTEST ACCOUNT. Nothing here runs automatically and
# nothing here is run by a harness. It asks before it writes.
#
# Safe to run twice: it checks the schema first and skips a migration that
# has already applied, and deploying an unchanged worker is a no-op.
#
#   bash tools/deploy_backend.sh              # ask, then migrate + deploy
#   bash tools/deploy_backend.sh --check      # report only, change nothing
#   bash tools/deploy_backend.sh --yes        # no prompt (for a known-good rerun)
#
# ⚠️ HIS MACHINE IS WINDOWS AND POWERSHELL HAS NO bash. This shipped as bash
# only and failed on the first real run with "The term 'bash' is not
# recognized". tools/deploy_backend.ps1 is the entry point there - it finds
# the bash that Git for Windows bundles and runs THIS script, rather than
# reimplementing the refusal logic below in a second language where it would
# be unrun and free to drift.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

DB_NAME="will-hill-contest"
DASH_CFG="cloudflare/wrangler.dashboard.toml"
GAME_CFG="cloudflare/wrangler.toml"

CHECK_ONLY=0
ASSUME_YES=0
for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=1 ;;
    --yes|-y) ASSUME_YES=1 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

die() { echo "" >&2; echo "STOPPED: $*" >&2; exit 1; }

# ── PREFLIGHT ────────────────────────────────────────────────────────────
#
# ⚠️ NO GLOBAL INSTALL REQUIRED, AND THAT IS DELIBERATE. "wrangler is not
# installed" stopped this dead on his machine, and the usual fix - npm i -g
# wrangler - then needs a NEW terminal before PowerShell finds it, which is a
# second dead end at the same hour. npx runs it out of the npm cache with no
# install and no PATH change. A global wrangler is still preferred when there
# is one: it is faster and it is the version he chose.
WRANGLER=()
if command -v wrangler >/dev/null 2>&1; then
  WRANGLER=(wrangler)
elif command -v npx >/dev/null 2>&1; then
  # --yes so the first run does not stop on npx's "Ok to proceed?" prompt with
  # nobody watching for it.
  WRANGLER=(npx --yes wrangler)
  echo "No global wrangler - using 'npx wrangler'. First run downloads it once."
  echo ""
else
  die "no wrangler and no npx, so nothing here can talk to Cloudflare.
  Install Node.js (which brings npx), then re-run. Optionally also
  npm i -g wrangler for a faster, pinned copy."
fi
[ -f "$DASH_CFG" ] || die "missing $DASH_CFG — run this from the repo."
[ -f "$GAME_CFG" ] || die "missing $GAME_CFG — run this from the repo."

# ⚠️ DEPLOYS THE CODE IN THIS WORKING TREE, not the code on main. If the tree
# is dirty you are shipping something that is not in the repo, which is how a
# fix becomes unreproducible. Warn loudly; do not block, because a one-line
# hotfix during a contest is a real thing.
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  echo "⚠️  Working tree is dirty — deploying what is on DISK, not what is on main."
  git status --short | sed 's/^/    /'
  echo ""
fi

echo "Repo:      $(git rev-parse --short HEAD) on $(git symbolic-ref --short -q HEAD || echo 'detached HEAD')"
echo "Database:  $DB_NAME"
echo ""

# ── WHAT THE LIVE SCHEMA ACTUALLY HAS ────────────────────────────────────
# Read the deployed schema instead of assuming which migrations have run.
# Every migration is one file in cloudflare/migrations/ named NNN-<column>.sql,
# so the column it adds is derivable from the filename and this loop needs no
# list to maintain.
live_columns() {
  "${WRANGLER[@]}" d1 execute "$DB_NAME" --remote --json \
    --command "SELECT name FROM pragma_table_info('run_stats')" 2>/dev/null \
    | tr -d ' \n' | grep -o '"name":"[a-z_]*"' | cut -d'"' -f4
}

echo "Reading the live schema..."
COLUMNS="$(live_columns || true)"
[ -n "$COLUMNS" ] \
  || die "could not read run_stats from $DB_NAME.
  Most likely not logged in yet - run this once, in this same shell:
      ${WRANGLER[*]} login
  It opens a browser; authorise the Cloudflare account that owns the contest.
  Otherwise this account cannot reach that database. Nothing was changed."

PENDING=()
for f in cloudflare/migrations/*.sql; do
  [ -e "$f" ] || continue
  col="$(basename "$f" .sql | sed 's/^[0-9]*-//; s/-/_/g')"
  if echo "$COLUMNS" | grep -qx "$col"; then
    echo "  already applied: $(basename "$f")   (run_stats.$col is live)"
  else
    echo "  PENDING:         $(basename "$f")   (run_stats.$col is missing)"
    PENDING+=("$f")
  fi
done
echo ""

if [ "$CHECK_ONLY" = "1" ]; then
  echo "--check: nothing was changed. ${#PENDING[@]} migration(s) pending."
  exit 0
fi

# ── ASK ──────────────────────────────────────────────────────────────────
if [ "$ASSUME_YES" != "1" ]; then
  echo "About to:"
  [ "${#PENDING[@]}" -gt 0 ] && echo "  1. apply ${#PENDING[@]} migration(s) to the LIVE contest database"
  echo "  2. deploy will-hill-dashboard"
  echo "  3. deploy will-hill-leaderboard"
  echo ""
  printf "Type 'yes' to continue: "
  read -r reply
  [ "$reply" = "yes" ] || die "cancelled. Nothing was changed."
  echo ""
fi

# ── MIGRATE ──────────────────────────────────────────────────────────────
for f in "${PENDING[@]:-}"; do
  [ -n "$f" ] || continue
  echo "Applying $(basename "$f")..."
  # A migration that fails because it ALREADY applied is not a failure — the
  # column check above should have caught it, but a race or a hand-run ALTER
  # can get there first, and "duplicate column name" means the desired state
  # is the actual state. Anything else stops the script before it deploys.
  if ! out="$("${WRANGLER[@]}" d1 execute "$DB_NAME" --remote --file="$f" 2>&1)"; then
    if echo "$out" | grep -qi "duplicate column name"; then
      echo "  already there — continuing."
    else
      echo "$out" >&2
      die "migration $(basename "$f") failed. NOTHING was deployed, so the live
  workers still match the live schema. Fix this before deploying."
    fi
  fi
done

# ⚠️ VERIFY BY READING BACK. A zero exit from the migration is not evidence
# the column exists; this is the house rule about never claiming something
# works without measuring it, and it is the check the whole script is for.
echo "Verifying the live schema..."
COLUMNS="$(live_columns || true)"
for f in cloudflare/migrations/*.sql; do
  [ -e "$f" ] || continue
  col="$(basename "$f" .sql | sed 's/^[0-9]*-//; s/-/_/g')"
  echo "$COLUMNS" | grep -qx "$col" \
    || die "run_stats.$col is STILL missing after migrating.
  Nothing was deployed. Deploying now would blank the dashboard."
  echo "  ok: run_stats.$col"
done
echo ""

# ── DEPLOY ───────────────────────────────────────────────────────────────
# Dashboard first: it is read-only, so if something is wrong with the schema
# it fails where only he is looking, not where players are submitting.
echo "Deploying will-hill-dashboard..."
"${WRANGLER[@]}" deploy -c "$DASH_CFG"
echo ""
echo "Deploying will-hill-leaderboard..."
"${WRANGLER[@]}" deploy -c "$GAME_CFG"

cat <<'DONE'

Deployed. Two things to look at, in this order:

  1. Open the dashboard link. If the clock top-right reads HTTP 500, the
     schema and the worker disagree — say so rather than refreshing at it.
  2. Play one run and submit it. Then check that RUNS went up AND the stats
     tiles moved. A score that saves while the tiles stay still is the stats
     row failing silently, which is the one thing this script exists to stop.

DONE
