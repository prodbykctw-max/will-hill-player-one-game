# ⛔ BEFORE YOU CHECK THE OTHER CHAT — the rule for all three sessions

Client, after two sessions independently investigated the same loading problem
on the same day:

> *"Check with the other chat first... and make a rule for all of you guys.
> Make a file that has a rule for all of you guys. It says before you check the
> other chat."*

**Three sessions work this repo at once. None of you can see the others' chat.
The repo is the only place you share a brain.** So the rule is not "coordinate
when convenient" — it is a gate you pass through before you do anything that
lands.

---

## WHO IS WHO — always name the chat by its branch

The client cannot tell you apart unless you say which one you are. **Never
write "the other chat" — name the branch.** He asked for this directly:
*"identify the chats when you refer to them, which one, so I can know."*

| branch | call it | what it has owned |
|---|---|---|
| `claude/contest-reg-image-crop-d4y6c0` | **BACKDROPS / DEPLOY chat** | stage backdrops, clouds and the cloud seal, the L5P seam, the Underground doubling, the registration crop — and the deploy-outage root cause + `tools/deploy_union.py` |
| `claude/dashboard-kills-display-sizing-wgufbm` | **DASHBOARD / BACKEND chat** | the admin dashboard, MAX COMBO, the D1 migration and both Cloudflare workers, the combo system — and the boot loader (`images.js`) + service worker |
| `claude/last-markdown-game-link-lvk1n6` | **TITLE / HOME chat** | the home screen and its layout, the title multiplane, PRESS START, the cabinet fit, OUR BAR ATL signage |

Ownership drifts as work moves — **re-derive it from `git log` rather than
trusting this table**, and correct the table in the same commit when it is
wrong. What must not drift is the habit of naming the branch.

## THE RULE

**Before you start work, before you merge to main, and before you deploy —
check the other chats first.** Checking means running the block below and
reading what it prints, not remembering what was true last time you looked.

```bash
git fetch origin                                  # ALL refs, not just main
for b in $(git ls-remote --heads origin | sed 's#.*refs/heads/##' | grep -v gh-pages); do
  printf '%-52s ahead %-3s  %s\n' "$b" \
    "$(git rev-list --count origin/main..origin/$b)" \
    "$(git log -1 --format='%h %ad %s' --date=format:'%H:%M' origin/$b | cut -c1-64)"
done
git log --oneline -15 origin/main                 # what landed while you were away
git log -1 --format='%h %ad' --date=iso origin/gh-pages   # what is actually LIVE
```

Then read, in this order:

1. **`docs/MERGE_STATE.md`** — run its stale-check first. It is where sessions
   hand each other findings. **A handoff addressed to you is work you have been
   assigned**, and it will not be repeated anywhere else.
2. **`docs/STATUS.md`** top entry — the most recent root-cause write-up.
3. **`docs/NEXT_CHAT.md`** — the open list and who owns what.

## WHY THIS EXISTS — the day it was written

On 2026-08-18 the client reported the game loading slowly. **Two sessions
investigated it independently, neither knowing the other had started.**

- The **BACKDROPS / DEPLOY chat** (`contest-reg-image-crop-d4y6c0`)
  root-caused it to the deploy itself: `gh-pages` is force-pushed as a fresh
  orphan, deleting every previously published hashed file, while `index.html`
  is served `max-age=600`. Seven deploys that day made seven windows where a
  live phone held an index whose bundle 404s. Fixed by publishing the union of
  recent builds (`tools/deploy_union.py`), which also un-bricked everyone
  already stranded.
- The **DASHBOARD / BACKEND chat** (`dashboard-kills-display-sizing-wgufbm`)
  measured the boot payload, found 9 MB gated before PRESS START and no service
  worker, and built one.

Both findings were real and they compose. **But the DASHBOARD chat had already
written and tested a whole service worker before discovering that the BACKDROPS
chat had shipped a deploy fix for the same complaint an hour earlier — and had
left it two findings in `MERGE_STATE.md` addressed to it by name.** Nobody was
wrong; nobody checked.

That is the whole cost this file exists to stop: not conflicts, which git
catches, but **two people solving the same problem twice and neither seeing the
other's evidence.**

## ⚠️ AUGUST 26 IS NOT A DEADLINE — do not plan around it

Client, plainly:

> *"We're not fucking with August 26 because we're not sure exactly what's
> gonna happen for real for real with people at the end of the day."*

The 26th has been repeated in these docs as if it were fixed. **It is not.** Do
not use it to justify urgency, to rush a change past its harness, to defer work
"until after the 26th", or to tell the client something must happen by then.

This sits alongside the rule that already exists and still holds:
⚠️ **DO NOT CHASE HIM FOR THE CONTEST DATES.** Will Hill's team is in
Australia. He has asked directly to stop being asked, and he will tell you when
he knows. `CONTEST_START` / `CONTEST_END` being `0` blocks no development — it
is two numbers at the end.

## ⚠️ A DEPLOY IS NOT A PRIVATE ACT

Deploying publishes for **every session and every live player**, and until
`deploy_union.py` landed, every deploy stranded anyone mid-session. Even now:

- Deploy what is on `main`, not what is in your tree — `deploy.sh` warns if
  dirty, and shipping an uncommitted change makes a fix unreproducible.
- **NEVER `git add -A` on `gh-pages`.** See `CLAUDE.md` — a sibling project
  leaked real reference photos onto a public branch exactly that way.
- Do not tell the client something is undeployed without **diffing the build**.
  A docs-only commit moves main's hash and ships nothing.

## IF THE OTHER SESSION IS MID-FLIGHT

A branch that is `ahead` of main is a session with work in the air. Do not
rebase it, force-push it, or merge it on their behalf without a reason — and if
you do merge it, run the deletion check first, because it has caught real
losses here twice:

```bash
git diff --diff-filter=D --name-only origin/main...<branch>   # must be empty
```

`behind` is not a debt. It is main moving underneath a session that is working.
**Only `ahead` represents work at risk.** Reporting a busy session as "13
behind" once read as "that chat is stalled" — it was 0 ahead and pushed three
commits minutes later.

## HANDING SOMETHING OVER

Put it in `docs/MERGE_STATE.md` under a heading that names the session it is
for, with the evidence attached so nothing has to be re-derived. Edit that file
**alone, in its own commit** — never carried along with feature work — which is
the only reason it never conflicts with the thing it describes.
