# The contest backend — deploying it

Two Workers and one **D1 database**. Nothing here is deployed: creating the
database and pushing the Workers touches the live Cloudflare account, so it
stays a manual, explicitly-confirmed step.

> ⚠️ **THIS USED TO SAY KV. DO NOT CREATE A KV NAMESPACE.**
> The first design held the whole leaderboard in one KV key and did
> read-modify-write on every submit. KV has **no compare-and-swap**, so two
> players finishing at the same moment both read the old list and the second
> write erases the first — a lost score, in a contest with a real prize. KV
> also allows roughly **one write per second per key**, which makes a launch
> party a queue against a single key. D1 makes "keep the highest" an atomic
> upsert instead. If you find a KV instruction anywhere, it is stale.

---

## 1. Create the database and load the schema

```sh
wrangler d1 create will-hill-contest
wrangler d1 execute will-hill-contest --remote --file=cloudflare/schema.sql
```

`wrangler d1 create` prints a `database_id`. Paste the **same id** into both
config files, replacing `TODO_CREATE_D1_DATABASE`:

- `cloudflare/wrangler.toml` — the public game Worker
- `cloudflare/wrangler.dashboard.toml` — the admin dashboard

Four tables (`cloudflare/schema.sql`), and the split is the point:

| table | holds | who reads it |
|---|---|---|
| `runs` | id, name, score, plays — **no contact column at all** | the public `/top` |
| `entrants` | phone, email, name | the dashboard only |
| `seen_runs` | one row per run id — the replay lock | `/submit` |
| `rejects` | every refusal with its reason | the dashboard |

`runs` has no phone column, so the public endpoint cannot leak one even if
somebody writes a careless query later. That is structural, not a convention.

## 2. Deploy the public Worker

```sh
wrangler deploy -c cloudflare/wrangler.toml
```

Serves `GET /top?n=` (cached ~2s at the edge) and `POST /submit` (never
cached). Origin-locked, replay-protected, honeypotted, fail-closed.

## 3. Deploy the dashboard — separate Worker, separate hostname

```sh
wrangler deploy -c cloudflare/wrangler.dashboard.toml
wrangler secret put DASH_TOKEN --name will-hill-dashboard   # openssl rand -hex 24
```

Then the link is `https://<dashboard-host>/?k=<DASH_TOKEN>`.

⚠️ **Rotating `DASH_TOKEN` is the kill switch.** Re-run the `secret put` with a
new value and every link ever sent stops working. That is the only thing that
makes a login-free page showing real phone numbers acceptable — a share link is
forwardable. **Rotate it the day the contest closes.**

It is a separate Worker on purpose. Folding an `/admin` route into the game
Worker would be less code, and that is exactly what makes it worse: the game
Worker is the one every phone is hammering and the one an attacker already has
a URL for.

## 4. Point the game at it

Set `LB_BASE` in `src/net/leaderboard.js` to the deployed Worker's URL, then
`npm run build && bash tools/deploy.sh`.

Until that is set, `lbOn()` is false, nothing is submitted, and the board shows
the player's own local runs rather than an error. That is deliberate — a board
saying "could not load" is worse than a short local one.

⚠️ Also add the deployed origin to `ALLOWED_ORIGINS` in
`leaderboard-worker.js` if the game ever moves off
`https://prodbykctw-max.github.io`.

## 5. Set the contest window

`CONTEST_START` and `CONTEST_END` in `leaderboard-worker.js` are both `0`,
which the Worker reads as **"not configured — allow everything"**. Set real
ms-epoch values before launch or the contest never closes.

## 6. In the Cloudflare dashboard, not in code

- **Rate limiting** on `/submit` — per IP, e.g. 10/min and 100/hour. A request
  rejected at the edge never runs code and never touches D1.
- **Turnstile** on the contest form, verified inside `/submit`.
- **A billing alert**, so a hammering costs a notification rather than a bill.

---

## Before paying out

No amount of code makes a public web game uncheatable — the client is
readable, so a determined person can synthesise an event log that passes every
check. Every measure above raises the cost; none makes it impossible.

**The prize is claimed on a real phone and a real address.** Review the top few
by hand first: score against the measured ceiling (`tools/harness/ceiling.mjs`
computes it), run duration, when they entered. Five minutes on three people.
