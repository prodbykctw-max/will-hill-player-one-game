# Three chats, one main — rebase before anything merges

Client: *"make sure that you and the other two chats everybody merge the shit
to main properly. Remind me to re-base everybody."*

This file exists because no branch's actual WORK touches it, so it cannot
conflict with the thing it is describing. That only holds if it is edited the
way this update was — alone, in a commit that changes nothing else, straight
after a merge. Never carry an edit to this file along with feature work.
**Re-run the commands at the bottom before acting — main moves.**

## State at main `323f812` — ALL THREE ARE IN, and gh-pages is rebuilt from it

| branch | ahead | behind | status |
|---|---|---|---|
| `claude/last-markdown-game-link-lvk1n6` | 0 | — | nothing outstanding |
| `claude/dashboard-kills-display-sizing-wgufbm` | **1 — but it is a GHOST** | 12 | see below |
| `claude/contest-reg-image-crop-d4y6c0` | 0 | 0 | merged fast-forward at `323f812` |

`gh-pages` was rebuilt from **main** at `323f812`; the live bundle is
`index-b1G7z0XG.js`, checked against a local build, and the branch carries 206
files, none of them source.

⚠️ **`dashboard-kills-display-sizing-wgufbm` reports "1 ahead" and has NOTHING
to merge.** Its tip `100006c` ("The combo chain") is byte-identical to
`d9e0bca`, already in main — same `git patch-id`. It is a pre-rebase copy left
behind when the branch was rebased, and the branch is 12 behind. **Do not merge
it and do not treat the count as work at risk.** `git rev-list --count` counts
commits, not content; the check that answers the question is:

```bash
pid=$(git show <branch-tip> | git patch-id --stable | cut -d' ' -f1)
for c in $(git log --format=%H -40 origin/main); do
  [ "$(git show $c | git patch-id --stable | cut -d' ' -f1)" = "$pid" ] \
    && echo "already in main: $(git log --oneline -1 $c)"
done
```

The safe move for that branch is the one `CLAUDE.md` already prescribes for a
merged branch: restart it from the latest main, keeping the name.

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
`2d63d6f`, arriving between a fetch and a push. It then moved **three more
times during the Underground/seam round** — `35df100`, `cec447e`, `b4f9f9d` —
all from the title/home chat. That round rebased with no conflict in any source
file (they were in `title.js` / `main.js` / `panel.js` / `stillscene.js`, this
was `stages.js` plus two plates), but all five doc and skill files were
`changed in both`. Git auto-merged them; the check that mattered was proving it
had not dropped anything, by testing every added line for membership:

```bash
git show <their-commit> -- <file> | grep '^+' | ...   # each line still present?
```

145 of 145 of their lines survived. **Do that check rather than trusting a
clean rebase** — a clean rebase means no textual conflict, not no loss. Fetch again immediately before
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

## ✅ The contest backend is DONE — stop telling him to deploy it

⚠️ **This section said the opposite and was wrong, and it cost a round of the
client's time.** It claimed the migration had not been run and the workers had
not been redeployed. Both had. He asked *"are you sure the D1 migration is
needed?"* — he was right, and the doc was the reason anyone thought otherwise.

Verified against the live account, not against this file:

| | evidence |
|---|---|
| `run_stats.max_combo` | **present** — `INTEGER NOT NULL DEFAULT 0`, read out of `pragma_table_info` |
| it came from the MIGRATION | it is the **last** column (cid 23). `schema.sql` puts it mid-table before `city`, so a fresh `CREATE TABLE` would not place it there — `ALTER TABLE ADD COLUMN` appends |
| both workers | deployed `2026-08-18T02:28Z` |
| the deployed worker is CURRENT | its code carries `MAX_COMBO = 9999`, the `combo` branch in `statsFromEvents`, and `max_combo` in the `INSERT INTO run_stats` binding |
| the one commit since (`d9e0bca`) | touches `cloudflare/` but is **comment-only** — behaviour is identical |

So there is nothing to run. `tools/deploy_backend.sh` / `.ps1` remain the way
to deploy any FUTURE worker change, and they are safe to re-run: they read the
live columns first and skip applied migrations, and treat "duplicate column
name" as success either way.

⚠️ **HOW TO CHECK THIS RATHER THAN BELIEVE IT.** One query settles it, and the
Cloudflare MCP can run it read-only:

```sql
SELECT name FROM pragma_table_info('run_stats');   -- is max_combo there?
```

Then compare `workers_list`'s `modified_on` against the commit times of
anything touching `cloudflare/` — and mind the timezone, because the commits
are `-04:00` and the deploy stamps are `Z`. That four-hour offset is exactly
what made a comment-only commit look like undeployed work.

⚠️ **A doc that states live infrastructure state goes stale the moment someone
acts on it, and nothing in the repo notices.** Re-derive from the account
before repeating any claim in this section.

## The only thing genuinely outstanding

`CONTEST_START` / `CONTEST_END` are still `0` in both workers, so the window is
unenforced. ⚠️ **DO NOT CHASE HIM FOR THE DATES** — Will Hill's team is in
Australia, he asked directly to stop being asked, and he will hand them over.
