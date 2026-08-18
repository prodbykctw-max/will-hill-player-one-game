# Three chats, one main — rebase before anything merges

Client: *"make sure that you and the other two chats everybody merge the shit
to main properly. Remind me to re-base everybody."*

This file exists because no branch's actual WORK touches it, so it cannot
conflict with the thing it is describing. That only holds if it is edited the
way this update was — alone, in a commit that changes nothing else, straight
after a merge. Never carry an edit to this file along with feature work.
**Re-run the commands at the bottom before acting — main moves.**

## State at main `6954130`

| branch | ahead | behind | status |
|---|---|---|---|
| `claude/last-markdown-game-link-lvk1n6` | 0 | 1 | mine — behind by one, nothing of its own outstanding |
| `claude/dashboard-kills-display-sizing-wgufbm` | 0 | 0 | **merged twice and reset. Clean — not a trap any more.** |
| `claude/contest-reg-image-crop-d4y6c0` | 6 | 9 | not merged, **now the dangerous one — see below** |

## ✅ The dashboard branch is no longer a trap

It was, and the warning that used to be here was right. It has since been
**reset to main and re-used**, so the stale tree that would have deleted 853
lines is gone. Both of its rounds are in main:

- `eb0edd3` — DEATHS tile sized for contest-scale numbers, MAX COMBO,
  `cloudflare/migrations/001-max-combo.sql`, `tools/harness/dashfit.mjs`.
- `6954130` — STAGE PROGRESSION fits six-figure run counts, and
  `tools/deploy_backend.sh`.

Deletions against main are **zero**, measured, and the branch now sits level
with main. Nothing to do with it.

⚠️ **The check in this file caught a real one on the way**, which is why it
should keep being run rather than trusted from memory. That branch was two
commits behind when its second round was ready, and
`git diff --stat main branch` showed it would have deleted
`tools/feather_flat_edge.py` and reverted both `eav-tree` assets — work that
had landed in the meantime. Rebasing first fixed it. **Behind-ness is the
whole hazard: a branch does not just bring its own work, it brings the
ABSENCE of everything added since it forked.**

## ⚠️ THE REGISTRATION BRANCH IS THE TRAP NOW, AND IT IS A BIGGER ONE

`claude/contest-reg-image-crop-d4y6c0` is **9 behind**. Merged as it stands it
would delete **ten files** from main, measured just now, not guessed:

```
$ git diff --diff-filter=D --name-only origin/main origin/claude/contest-reg-image-crop-d4y6c0
cloudflare/migrations/001-max-combo.sql
docs/MERGE_STATE.md
src/assets/backgrounds/ending-crowd.webp
src/assets/backgrounds/ending-hero.webp
tools/cut_audit.py
tools/deploy_backend.sh
tools/feather_flat_edge.py
tools/harness/dashfit.mjs
tools/refit_card_boundary.py
tools/retrace_card.py
```

That list includes the contest migration and the script that runs it. **Do not
merge it until it has been rebased onto main and that list is empty.**

## Then the registration branch, carefully

`claude/contest-reg-image-crop-d4y6c0` touches `src/main.js`, `index.html`,
`docs/NEXT_CHAT.md`, `docs/STATUS.md` and `docs/TESTING.md`. Main changed
**all** of those in the same window:

- `src/main.js` — `beginFromTitle()` replaced the old START gate, the panel
  now opens with a `flow`, and `signupOffered`/`localRuns` are no longer
  imported. A branch that predates that will conflict right where the sign-up
  is triggered, which is exactly what it is editing.
- `index.html` — the pinch/double-tap guards were added at the foot of the
  file and `touch-action: manipulation` on every panel control. Its cabinet
  geometry edits are in the same stylesheet.
- `docs/NEXT_CHAT.md` — both sides rewrote sections of it.

Take **main's** version of the flow (`beginFromTitle`, `flow: 'start' |
'post' | 'menu'`) and **the branch's** version of the cabinet geometry and the
cropped card. They are solving different problems in the same files.

After the rebase, that branch must re-run `startflow.mjs` (20 checks) and
`btnglow.mjs` (29) — its cabinet crop changes the rects `btnglow` measures.

## The commands

```bash
# in each of the other two chats
git fetch origin main
git rebase origin/main
# ⚠️ THEN PROVE IT DELETES NOTHING. This is the check that caught the
# dashboard branch; a clean rebase is not the same as a safe merge.
git diff --diff-filter=D --name-only origin/main HEAD    # must print nothing
# re-run that chat's harnesses, then
git push -u origin <its-branch> --force-with-lease
```

Nothing merges to main until its own harnesses are green on the rebased
result. And nothing on `gh-pages` is hand-made: deploys go through
`bash tools/deploy.sh` only — see the guardrail in `CLAUDE.md`.

## The contest backend still has ONE client-side step

`cloudflare/migrations/001-max-combo.sql` has **not** been run against D1, and
the workers have **not** been redeployed — main is ahead of what is live. Both
are one command on a machine with `wrangler` logged in:

```bash
bash tools/deploy_backend.sh
```

It migrates, reads the schema back to confirm the column landed, and only then
deploys — dashboard first, game worker second. It refuses to deploy anything
if the migration did not take, which is the failure that would otherwise blank
his dashboard mid-contest. `--check` reports without changing anything.

⚠️ **Order is not optional and the script is why.** Deploying the dashboard
worker ahead of the column blanks every number behind his artwork; deploying
the game worker ahead of it is quieter and worse — scores keep saving while
every run in that window loses its stats row permanently.
