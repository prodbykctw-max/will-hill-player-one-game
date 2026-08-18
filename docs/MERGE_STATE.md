# Three chats, one main — rebase before anything merges

Client: *"make sure that you and the other two chats everybody merge the shit
to main properly. Remind me to re-base everybody."*

This file exists because no branch's actual WORK touches it, so it cannot
conflict with the thing it is describing. That only holds if it is edited the
way this update was — alone, in a commit that changes nothing else, straight
after a merge. Never carry an edit to this file along with feature work.
**Re-run the commands at the bottom before acting — main moves.**

## ⚠️ IS THIS FILE STALE? Run this before believing a word of it

It has now gone stale twice on the same failure mode: a section stated
something true about the code, the code changed, and nothing here noticed. The
worst one told readers MAX COMBO would read zero for every entrant while the
combo system was already live — `d9e0bca` shipped it the same day this file was
still describing the absence of it. **Every claim below is a timestamped assertion,
not a fact.** Six commands, under a minute:

```bash
git fetch origin                                    # 1. all refs, not just main
git log --oneline -1 origin/main                    #    does the header match?
for b in $(git ls-remote --heads origin | sed 's#.*refs/heads/##' | grep -v gh-pages); do
  printf '%-46s ahead %s\n' "$b" "$(git rev-list --count origin/main..origin/$b)"
done                                                # 2. branch table
npm run build && git ls-tree -r --name-only origin/gh-pages | grep '^assets/' \
  | sed 's#^assets/##' | sort | diff - <(ls dist/assets | sort)
                                                    # 3. is the LIVE game current?
grep -n "record('combo'" src/main.js                # 4. MAX COMBO section
grep -n "LB_BASE = " src/net/leaderboard.js         # 5. backend section
grep -n "CONTEST_START = " cloudflare/*.js          # 6. the outstanding item
```

Anything that disagrees with the text below: **the text is wrong, fix it here
in a commit of its own.** And for any quote this file attributes to a source
file, grep the quote — one of them had been deleted from the source and was
still being repeated here as current.

## State at main `aec476b` — ALL THREE BRANCHES ARE FULLY MERGED

Re-derived, not remembered. Every branch is an ancestor of main; none of them
holds anything.

| branch | ahead | behind | tip |
|---|---|---|---|
| `claude/contest-reg-image-crop-d4y6c0` | 0 | 6 | `323f812` |
| `claude/dashboard-kills-display-sizing-wgufbm` | 0 | 11 | `dad801d` |
| `claude/last-markdown-game-link-lvk1n6` | 0 | 1 | `32ca22f` |

`gh-pages` is at `627020d`, built from main by `tools/deploy.sh`. Proof that
the live game is current is a rebuild, not the commit hash: `npm run build`
from main produces **196 assets, every one matching the branch's `assets/` by
content-hashed name, with `index.html` byte-identical at 34,527 bytes**.
Bundle `index-mTnpEOyP.js`, confirmed being served by the CDN.

⚠️ **`git fetch origin main` DOES NOT UPDATE `origin/gh-pages`, and reading the
stale ref makes a current deploy look wildly rotten.** Step 3 of the check
above ran against a `refs/remotes/origin/gh-pages` from several deploys back
and reported **175 assets against 196, with almost every hash different** — a
result that reads as "the live game is months behind" and is pure artefact.
Step 1 says `git fetch origin`, all refs, for exactly this reason; shortening
it to `git fetch origin main` is what produced the false alarm. If step 3 ever
looks catastrophic, re-run `git fetch origin '+refs/heads/*:refs/remotes/origin/*'`
and diff again BEFORE telling him anything.

⚠️ **A docs-only commit on main does NOT make the deploy stale**, and counting
commits will tell you it does. `555efbe` touched only this file and the build
from it was identical to the one deployed at `323f812`; `aec476b` adds a
harness and a Worker comment and ships nothing either. Diff the build,
not the log.

### The ghost is gone — but the lesson it taught is the reason this file exists

For a few hours `dashboard-kills-display-sizing-wgufbm` reported **1 commit
ahead of main with nothing to merge**: its tip `100006c` was byte-identical to
`d9e0bca` already in main — a pre-rebase copy left behind when the branch was
rebased. That branch has since been force-updated to `dad801d` and now reads 0
ahead, so the trap is spent. **Keep the check**, because `git rev-list --count`
counts commits and not content, and this is what settles it:

```bash
pid=$(git show <branch-tip> | git patch-id --stable | cut -d' ' -f1)
for c in $(git log --format=%H -40 origin/main); do
  [ "$(git show $c | git patch-id --stable | cut -d' ' -f1)" = "$pid" ] \
    && echo "already in main: $(git log --oneline -1 $c)"
done
```

Or more simply, when you only need a yes/no:
`git merge-base --is-ancestor origin/<branch> origin/main`.

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
clean rebase** — a clean rebase means no textual conflict, not no loss. Fetch
again immediately before pushing, and be ready to rebase and re-run the check
rather than assuming the window held.

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

## ✅ MAX COMBO IS LIVE — this section used to say the opposite

⚠️ **It read "MAX COMBO WILL READ ZERO FOR EVERY ENTRANT" and that is now
false.** It was true when written; `d9e0bca` shipped the combo system and made
it false, and nothing in the repo noticed. Anyone reading the old text would
have seen real chain numbers on the dashboard and gone looking for the bug.

What is actually true, checked in the source rather than recalled:

- `src/main.js:1154` — `state.runLog.record('combo', { n: state.comboBest })`,
  recorded on each new best rather than once at the end, so it is correct
  whether a run ends at a death, a continue that renews the run id, or the last
  stage clear.
- `src/net/leaderboard.js:356` — the `combo` branch in `statsFromEvents` takes
  the MAX of what it finds.
- The comment this section used to quote — *"NOTHING EMITS THIS YET"* — **no
  longer exists in the file.** Grep for a quote before repeating it.

⚠️ **A COMBO IS STILL WORTH ZERO POINTS AND MUST STAY THAT WAY.** It is in no
entry of `scoreOf()` and none of the Worker's `SCORE_RULES`, and
`tools/harness/combo.mjs` fails if a chain ever moves the score. The ceiling is
MEASURED (61,650) against a 70,000 refusal threshold and a 400/second rate
check — a bonus would not show up as a wrong number, it would show up as a
genuinely great run refused mid-contest as implausible.

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

Verified against the live account **again on 2026-08-18**, not against this
file:

| | evidence |
|---|---|
| `run_stats.max_combo` | **present** — `SELECT name FROM pragma_table_info('run_stats')` returns it |
| it came from the MIGRATION | it is the **last** column (cid 23). `schema.sql` puts it mid-table before `city`, so a fresh `CREATE TABLE` would not place it there — `ALTER TABLE ADD COLUMN` appends |
| both workers | `workers_list` → dashboard `2026-08-18T02:28:15Z`, leaderboard `2026-08-18T02:28:22Z` |
| the leaderboard worker answers | `GET /top` → `200 {"ok":true,"runs":[]}` (empty because he cleared his test score himself) |
| `LB_BASE` is wired | `src/net/leaderboard.js:27` → `https://will-hill-leaderboard.prodbykctw.workers.dev`. ⚠️ This file used to say it was empty until deploy; it is not |
| the one `cloudflare/` commit since the deploy | `d9e0bca` at **02:47Z, 19 minutes AFTER** the 02:28Z deploy — and comment-only. Verified by stripping comment and blank lines from `git show d9e0bca -- cloudflare/`: **zero code lines remain** |

⚠️ `d9e0bca` postdating the deploy is exactly the shape that looks like
undeployed work and is not. Strip the comments out of the diff before
concluding anything from a timestamp.

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

## ⛔ BLOCKED ON THE CLIENT'S CLIENT — not a task, not a to-do

`CONTEST_START` / `CONTEST_END` are `0` at `leaderboard-worker.js:54-55` and
`dashboard-worker.js:74-75`, so `withinWindow()` returns true for everything.
**That is the correct standing state and it is not waiting on anybody here.**

Him, asked and answered, in his own words: *"the contest start date — until Will
Hill's team lets me know. If somebody from Australia reaches out. I don't know
when that is."*

⚠️ **DO NOT CHASE HIM FOR THE DATES.** Will Hill's team is in Australia, he has
asked directly to stop being asked, and he will hand them over when he has them.
This entry exists so the next session does not re-file it as an open task and
put the question back in front of him. When the dates arrive it is two constants
in two files and a worker redeploy.
