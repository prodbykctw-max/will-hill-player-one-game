# Three chats, one main — rebase before anything merges

Client: *"make sure that you and the other two chats everybody merge the shit
to main properly. Remind me to re-base everybody."*

This file exists because it is the one document none of the three branches
touch, so it cannot conflict with the thing it is describing. **Re-run the
commands at the bottom before acting — main moves.**

## State at main `fcca834`

| branch | ahead | behind | status |
|---|---|---|---|
| `claude/last-markdown-game-link-lvk1n6` | 0 | 0 | mine — already **is** main |
| `claude/dashboard-kills-display-sizing-wgufbm` | 1 | 7 | **MERGED. Do not merge again — delete it.** |
| `claude/contest-reg-image-crop-d4y6c0` | 5 | 7 | not merged, **high** conflict |

## ⚠️ The dashboard branch is a trap now

Its work IS in main, as `eb0edd3` — DEATHS tile sized for contest-scale
numbers, MAX COMBO, and `cloudflare/migrations/001-max-combo.sql`. It landed
with a different SHA, so git still reports the branch as "1 ahead" and it
looks unmerged.

**Merging it again would delete 853 lines across 10 files**, including
`tools/refit_card_boundary.py` and `tools/retrace_card.py`, because its tree
predates all the cut-audit work. Measured, not guessed:

```
$ git diff --stat origin/main origin/claude/dashboard-kills-display-sizing-wgufbm
 tools/refit_card_boundary.py   | 187 -------------------
 tools/retrace_card.py          | 142 -------------
 10 files changed, 9 insertions(+), 853 deletions(-)
```

Delete the branch, or reset it to main. Do not merge it.

That migration still needs running against D1 when the worker deploys — a
client-side step, same as everything else in `cloudflare/`.

**The general rule this proves:** a branch that is behind main does not just
bring its own work, it brings the ABSENCE of everything added since it forked.
Always rebase before merging, and always read `git diff --stat main branch`
for deletions first.

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
# resolve, then re-run that chat's harnesses before pushing
git push -u origin <its-branch> --force-with-lease
```

Nothing merges to main until its own harnesses are green on the rebased
result. And nothing on `gh-pages` is hand-made: deploys go through
`bash tools/deploy.sh` only — see the guardrail in `CLAUDE.md`.
