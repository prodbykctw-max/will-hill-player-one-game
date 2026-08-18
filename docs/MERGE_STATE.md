# Three chats, one main — rebase before anything merges

Client: *"make sure that you and the other two chats everybody merge the shit
to main properly. Remind me to re-base everybody."*

This file exists because it is the one document none of the three branches
touch, so it cannot conflict with the thing it is describing. **Re-run the
commands at the bottom before acting — main moves.**

## State when this was written (main at `3ca4abc`)

| branch | ahead | behind | what it holds | conflict risk |
|---|---|---|---|---|
| `claude/last-markdown-game-link-lvk1n6` | 0 | 0 | mine — already **is** main | — |
| `claude/dashboard-kills-display-sizing-wgufbm` | 1 | 3 | DEATHS tile sized for contest-scale numbers, MAX COMBO, a D1 migration | **low** |
| `claude/contest-reg-image-crop-d4y6c0` | 4 | 3 | the registration overlay — sign-up card cropped out of the machine and laid over the room, between-screen buttons, score before the next level | **high** |

## Merge the low-risk one first

`claude/dashboard-kills-display-sizing-wgufbm` touches `cloudflare/`,
`src/net/leaderboard.js`, `tools/harness/dashfit.mjs` and a new
`cloudflare/migrations/001-max-combo.sql`. Almost nothing there overlaps the
work on main. It carries a **schema migration**, so it needs running against
D1 when it deploys — that is a client-side step, same as everything else in
`cloudflare/`.

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
