# Brief for a Cowork session — Will Hill: Player One

**Written 2026-08-14 by the remote Claude Code session working on this repo.**
Hand this whole file to a Cowork session. It is self-contained — a Cowork
session starts with no memory of the work that produced it.

Two parts:

1. **The Drive fetch** — the job that needs Cowork specifically, because the
   remote session is locked out of Google Drive.
2. **The full open-task list** — everything outstanding on the project, marked
   with what Cowork can actually take on and what it must not touch.

Read `CLAUDE.md` and `docs/HANDOFF.md` in the repo before doing anything. The
handoff is 1,500 lines and it is load-bearing — a stale assumption already cost
this project a session of re-doing finished work.

---

---

# PART 1 — The Drive fetch

## Why this exists

The remote Claude Code session cannot reach Google Drive. Measured, not
assumed — three MCP servers were called in the same session:

| server | call | result |
|---|---|---|
| AutoSprite | `get_account` | went through (returned the server's own auth error) |
| Cloudflare | `search_cloudflare_documentation` | went through (returned docs) |
| **Google Drive** | `search_files`, `list_recent_files` | **`-32003 MCP tool call requires approval`** |
| **claude-code-remote** | `list_environments` | **`-32003 MCP tool call requires approval`** |

Adding all five Drive read tools to `.claude/settings.local.json`
`permissions.allow` — under both the old name (`mcp__Google_Drive__*`) and the
current UUID name (`mcp__f2aaa6e0-…__*`) — did **not** lift it. The entries are
still in that file. Local settings are not the enforcement point.

Two flags in `~/.claude.json` describe the difference between the two surfaces:

```
tengu_remote_auto_mode_include_destructive_mcp   = false
tengu_cowork_auto_mode_include_allowed_write_mcp = true
```

The remote session is on the `false` side. A Cowork session is on the `true`
side. **That is the premise of this hand-off, and it is untested** — the remote
session could not open a Cowork session to check, because the tool that lists
environments is itself gated. If Drive is still blocked in Cowork, stop and say
so; do not work around it by asking for the files another way. The fallback
already works: prodbyKCTW can attach files directly in chat, and uploads land in
`~/.claude/uploads/<session>/` with no gate at all.

---

## Who and what

- **prodbyKCTW** — the developer. One token: lowercase `prodby`, uppercase
  `KCTW`. It does **not** come apart into "KC TW".
- **RARƎ AGENCY** — his agency, co-founded with Kema. **THE LAST E IS REVERSED,
  always.** `RAR` + a mirrored E. It reads at a glance like a 3. That is the
  brand, not a rendering fault. Do not "correct" it to a normal E in a filename,
  a commit message, or anything on screen.
- **Will Hill** — the artist the game stars, and the player character. A client
  of the agency, not the developer.

---

## The job

### 1. Find, under the RARƎ AGENCY profile in Drive

In priority order — the first two are what is actually blocking work:

1. **The RARƎ AGENCY logo** — any resolution, any format. Vector (SVG/AI/EPS) is
   better than raster. Transparent background strongly preferred.
2. **The prodbyKCTW logo** — same. The handoff notes the wordmark artwork is
   *the authority* on how the name is set, so the file matters more than any
   description of it.
3. **Ten Will Hill MP3s**, if they are there. The game currently ships
   prodbyKCTW's own instrumentals in all ten slots. Slot names, in order:
   `title`, `stage_01`, `map_01_02`, `stage_02`, `map_02_03`, `stage_03`,
   `map_03_04`, `stage_04`, `ui_pause`, `credits`.
4. **Any Will Hill artwork** not already in the repo — plates, portraits,
   promo art.

### 2. Report before you fetch

List what you found: filename, type, size, resolution if it is an image, and
which of the four categories above it belongs to. **Do not download everything
in the folder.** If there is a lot, say what is there and let prodbyKCTW pick.

### 3. Getting it into the repo

- Repo: `prodbykctw-max/will-hill-player-one-game`
- Branch: `claude/last-markdown-game-link-lvk1n6` (main is in sync with it)
- Logos go in **`src/assets/props/`** — Vite content-hashes anything imported
  from `src/`, so they must be imported as modules, never referenced by a
  literal path. A literal path resolves in dev and 404s in `dist/`.
- MP3s go in **`src/assets/music/`**, and each swap is one line in the manifest
  in `src/audio/music.js`.

**Two hard rules, both from `CLAUDE.md`, both learned the expensive way:**

- **NEVER `git add -A` on the `gh-pages` branch.** A previous project in this
  workspace leaked reference photos and an account cache onto a public branch
  exactly that way and the history had to be purged with an orphan force-push.
  `tools/deploy.sh` stages explicit paths only. Do not bypass it.
- **`assets/` is ignored by default, not by rule.** The test is: *if losing the
  file means the work cannot be rebuilt, commit it.* Irreplaceable sources go
  in. Re-downloadable packs and build scratch stay out.

If committing is awkward from Cowork, that is fine — **downloading the files and
handing them back so they can be attached in chat is a perfectly good outcome.**
The fetch is the hard part; the wiring is not.

---

---

# PART 2 — Every open item on the project

State as of 2026-08-14. Branch `claude/last-markdown-game-link-lvk1n6` and
`main` are both at `98c44f6`; gh-pages is deployed and live matches local
`dist/` byte for byte.

## A. Cowork can unblock these — this is the value of the session

| # | item | what is needed |
|---|---|---|
| A1 | **End-credits sequence** | The RARƎ AGENCY logo and the prodbyKCTW logo. The ending SCREEN is built — his painting, real stats, swaying crowd. The credits that share the frame with it are not, purely because those two files have only ever existed in chat. **This is the single highest-value thing in this list.** |
| A2 | **The credits wording** | Already captured verbatim in `docs/HANDOFF.md` "Still open" — music and SFX by prodbyKCTW; game design credit to Chemo, who picked and sourced the reference images and stylised them, so she designed the backgrounds, the character and the masked enemies. He picked the map and directed the styling. Everything else is his. Use that text as written; do not paraphrase it. |
| A3 | **Ten Will Hill MP3s** | The ten slots currently hold prodbyKCTW's own instrumentals. Slots are keyed by function, so each swap is one manifest line in `src/audio/music.js`. |
| A4 | **AutoSprite is refusing every call** | `Unauthorized: provide an MCP API key.` — re-tested today, both `get_account` and `list_characters`, same answer under both the old and new connector names. The server is reachable; no key is being presented. Generating a key at autosprite.io does not attach it — it has to go into the AutoSprite connector's settings on the claude.ai side. **If Cowork's connector auth differs, try one `get_account` call and see.** What it unblocks: the money-counting idle clip, which is fully wired behind its `HAS_FLEX` gate and 8/8 tested, and has no art. The exact call to make is written out in `docs/HANDOFF.md` under "The second idle". |

## B. Decisions only prodbyKCTW can make

Do not decide these. Surface them and wait.

- **B1 — The prize, and how the winner is contacted.** Does not change the
  schema; the private KV key already holds both phone and email.
- **B2 — The contest window.** `CONTEST_START` and `CONTEST_END` in
  `cloudflare/leaderboard-worker.js` are both still `0`.
- **B3 — The ending goes quiet.** Every music cue was timed today: title 1:26,
  stage_01 1:36, stage_02 1:39, stage_03 1:42, stage_04 1:38, map cues 0:44 /
  0:47 / 0:48, ui_pause 1:18, **credits 0:41**. Every stage is only 40–49s of
  road so no stage cue ever reaches its loop point — that half is comfortable.
  But `credits` is deliberately `loop: false` and the `complete` screen has no
  time limit, so sitting on the ending past 41s is silence. Three ways out:
  loop it, fade the screen out with the track, or a longer cue. **A music
  decision, not a bug.**
- **B4 — A pixel font for the leaderboard rows.** Currently monospace against
  his hand-lettered MARTA card. Any real pixel face is a licence question.
- **B5 — iPhone haptics.** Never once run on real hardware. Thirty seconds:
  open the game, tap OPTIONS, feel for a tick. If nothing happens the fallback
  is inert rather than broken.

## C. Real work, unblocked, nobody has done it

- **C1 — The clouds are not cut out of the portrait title.** Every other
  element is (`tp_logo`, `tp_signL`, `tp_signR`, `tp_hero`, `tp_pole`), so the
  clouds do not slide in with the rest the way he asked for. SAM merges them
  into the sky — they have no edge it can find — so this needs a **colour key**,
  which is a different tool from `tools/sam_segment.py`. Half a session of work
  and it needs no permissions at all. **Good Cowork task.**
- **C2 — Three day-plate joins** sit above their own plate's noise floor. The
  night half is done and measured. Why a pixel operation cannot close them is
  written up in `docs/HANDOFF.md` "The repeat seam" — read that before trying.

## D. Settled — do not "fix" these

- **D1 — The bag count is 400 and it has a ceiling of its own.** Quotas are
  90 / 97 / 103 / 110. Every bag is exactly 40,000, which is the client's
  number. **Past roughly 447 bags, 50,000 becomes reachable on bags alone and
  the champagne stops mattering at the top of the board.** That property is the
  thing being protected. See "400 is a quota, not a rate" in the handoff.
- **D2 — The enemy stomp clip holds ~2.3 cycles in 16 frames.** Left alone
  deliberately; the enemy is stationary while stomping so there is no ground
  speed for the cadence to disagree with.
- **D3 — No SMS verification on contest entry.** A decision, not an omission,
  and the reasoning is in the handoff. Do not re-litigate without new
  information.
- **D4 — The enemies are not rats.** The masked hoodie figures are the
  **enemies** (105 of them, 50 a stomp). The **rats** are one sprite of
  undercroft scenery under the street, untouchable, worth nothing. A draft of
  the scoring notes conflated them and the client caught it. Do not let the
  word back into a scoring table.

## E. Infrastructure warning

**The remote container silently rolled its working copy back to an old commit
four times in two days** — three times on 2026-08-14 alone, to `dff3d1e` every
time. No error, no warning; files written minutes earlier were simply gone.
Nothing was ever lost because everything is pushed immediately, and that is the
entire mitigation. Recovery is
`git fetch origin <branch> && git reset --hard origin/<branch>`.

**Check `git log --oneline -3` at the start of the session.** If HEAD is not
where `docs/HANDOFF.md` says it should be, the checkout is stale, not the
branch.

---

## What NOT to do

- **Do not create the Cloudflare KV namespace or deploy the Worker.** It is an
  explicitly-confirmed manual step and it stays that way even though the
  Cloudflare tools are right there.
- **Do not make the repo public.** Declined, and it stays declined — it holds
  prodbyKCTW's voice recording, the sprite sheets, and Will Hill's plates.
- **Do not touch anything in Drive other than reading.** No moving, renaming,
  sharing or deleting.
- **Do not guess, and do not say "rather than guessing" either.** Every claim
  about this project is measured by touching the running product. If you cannot
  measure it, say plainly that you did not, and say what would measure it.
  There are eight committed harnesses in `tools/harness/` — run them rather
  than reasoning about the game. They need
  `PLAYWRIGHT=/opt/node22/lib/node_modules/playwright/index.js` and
  `CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome` if the
  environment matches this one.
- **Update `docs/HANDOFF.md` after every major change.** That is a standing
  instruction on this project, not a nicety.
