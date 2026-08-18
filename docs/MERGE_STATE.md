# Three chats, one main — rebase before anything merges

Client: *"make sure that you and the other two chats everybody merge the shit
to main properly. Remind me to re-base everybody."*

This file exists because no branch's actual WORK touches it, so it cannot
conflict with the thing it is describing. That only holds if it is edited the
way this update was — alone, in a commit that changes nothing else, straight
after a merge. Never carry an edit to this file along with feature work.
**Re-run the commands at the bottom before acting — main moves.**

## State at main `ef8c2f2` — ALL THREE ARE IN

| branch | ahead | behind | status |
|---|---|---|---|
| `claude/last-markdown-game-link-lvk1n6` | 0 | — | mine — nothing outstanding |
| `claude/dashboard-kills-display-sizing-wgufbm` | 0 | — | merged, clean |
| `claude/contest-reg-image-crop-d4y6c0` | 0 | 0 | **merged at `ef8c2f2`. No longer a trap.** |

`gh-pages` was rebuilt from **main** after that merge, so the live game carries
all three chats' work for the first time.

## ✅ Nothing is a trap right now

Both warnings that used to live here were real and both are spent. Keep the
check itself — it caught a genuine loss on the dashboard branch, and the
registration branch's own numbers below show why the warning was worth writing.

- The dashboard branch was reset to main and re-used. Its rounds are in main as
  `eb0edd3` (DEATHS tile, MAX COMBO, the migration, `dashfit.mjs`) and
  `6954130` (STAGE PROGRESSION, `deploy_backend.sh`).
- The registration branch was **9 behind and would have deleted ten files**.
  Rebased before merging; after the rebase eight of those ten came back on
  their own, because they were never deletions — they were the *absence* of
  work added since the fork. That distinction is the whole lesson.

⚠️ **Behind-ness is the hazard, not conflict.** A branch does not just bring
its own work, it brings the ABSENCE of everything added since it forked. A
clean rebase is not the same as a safe merge, which is why the deletion check
below is run *after* rebasing and *before* merging, every time.

⚠️ **Main moved THREE times during that one merge** — `38990f0`, then
`2d63d6f`, arriving between a fetch and a push. Fetch again immediately before
pushing, and be ready to rebase and re-run the check rather than assuming the
window held.

## ⚠️ TWO FILES ARE DELETED ON PURPOSE — do not "restore" them

The registration merge removes exactly two, and the check will keep printing
them for anyone diffing against an older main:

```
src/assets/backgrounds/ending-crowd.webp
src/assets/backgrounds/ending-hero.webp
```

Both were cut from the **landscape** ending plate (1536x1024) that the client
replaced with a portrait 853x1843 one. They were the swaying crowd and hero
cards; they map to nothing on the new painting. `src/render/ending.js` was
rewritten and no longer imports them, and nothing else in the repo references
them. The crowd sway is a separate pass over the new art — his call, "ship it
flat first" — and `tools/cut_still.py` is what will do it.

## ⚠️ MAX COMBO WILL READ ZERO FOR EVERY ENTRANT

Not a bug, and worth knowing before anyone reads the dashboard and panics. The
tile, the D1 column and the migration are all in main, but nothing in the game
emits a `combo` event — `src/net/leaderboard.js` says so at the handler itself:

> *"NOTHING EMITS THIS YET. The combo system is not in the game — the client
> asked for MAX COMBO on the dashboard 'because I plan on working a combo
> system into the game'."*

The client's decision, asked and answered: **leave it**. It is derivable with
no new state if he ever wants it — `audio.js` already escalates the punch pitch
on stomps chained inside 1.2s, and every run-log event carries a millisecond
stamp — but that is a tested change of its own, not something to slip into a
deploy.

## What the registration merge actually collided with

Kept because the prediction was wrong in a useful way. This file expected
`src/main.js` and `index.html` to conflict, because main had rewritten both.
They did not: that rewrite landed in `294f2a1`, which the branch had already
rebased onto, and main never touched either file afterwards. **The real
overlap was three documentation files** — `docs/NEXT_CHAT.md`,
`docs/STATUS.md`, `docs/TESTING.md` — and git auto-merged all three.

⚠️ **An auto-merged markdown file still has to be READ.** "Successfully
rebased" says nothing about whether both sides survived. The check that proves
it is structural, not a glance:

```bash
# every heading main had must still exist afterwards
comm -23 <(git show origin/main:docs/STATUS.md | grep '^#' | sort -u) \
         <(grep '^#' docs/STATUS.md | sort -u)
```

Anything it prints is either a section you deliberately replaced — say which,
out loud — or a section the merge silently ate.

## The commands

```bash
git fetch origin main
git rebase origin/main
# ⚠️ THEN PROVE IT DELETES NOTHING. This is the check that caught the
# dashboard branch; a clean rebase is not the same as a safe merge.
git diff --diff-filter=D --name-only origin/main HEAD
#   -> must print NOTHING, or only deletions you can name and defend
# ⚠️ AND READ ANY AUTO-MERGED MARKDOWN — see the heading check above.
# re-run that chat's harnesses, then
git push -u origin <its-branch> --force-with-lease
# ⚠️ FETCH AGAIN IMMEDIATELY BEFORE PUSHING MAIN. It moved three times
# during the last merge, twice between a fetch and a push.
git fetch origin main && git push origin HEAD:main
```

Nothing merges to main until its own harnesses are green on the rebased
result — and that means the OTHER chats' harnesses too. The registration
merge ran `dashfit.mjs` (100 checks) for the first time on its own tree. And nothing on `gh-pages` is hand-made: deploys go through
`bash tools/deploy.sh` only — see the guardrail in `CLAUDE.md`.

## The contest backend still has ONE client-side step

`cloudflare/migrations/001-max-combo.sql` has **not** been run against D1, and
the workers have **not** been redeployed — main is ahead of what is live. Both
are one command on a machine with `wrangler` logged in:

```bash
bash tools/deploy_backend.sh              # macOS / Linux / Git Bash
.\tools\deploy_backend.ps1                # Windows PowerShell - his machine
```

It migrates, reads the schema back to confirm the column landed, and only then
deploys — dashboard first, game worker second. It refuses to deploy anything
if the migration did not take, which is the failure that would otherwise blank
his dashboard mid-contest. `--check` reports without changing anything.

⚠️ **Order is not optional and the script is why.** Deploying the dashboard
worker ahead of the column blanks every number behind his artwork; deploying
the game worker ahead of it is quieter and worse — scores keep saving while
every run in that window loses its stats row permanently.
