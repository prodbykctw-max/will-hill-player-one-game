# Contest leaderboard — deploy (not done yet)

`leaderboard-worker.js` is real, working code (see its header comment and `docs/GDD.md` "Leaderboard & contest" for the design it implements — replay/event-log score validation, public name+score / private phone+email split, 3-day contest window). **It has not been deployed, and its KV namespace has not been created.** Both touch the live Cloudflare account, so they're a manual, explicitly-confirmed step — mirroring how the Jandé project's leaderboard Worker was handled.

## Before deploying

1. Set the real contest window: fill in `CONTEST_START` / `CONTEST_END` (ms epoch) in `leaderboard-worker.js`.
2. Create the KV namespace and put its id in `wrangler.toml` (`TODO_CREATE_KV_NAMESPACE`):
   ```bash
   npx wrangler kv namespace create LB
   ```

## Deploy

```bash
cd cloudflare
npx wrangler login          # once, opens the browser
npx wrangler deploy         # deploys leaderboard-worker.js + binds the KV
```

`wrangler deploy` prints the live URL, e.g. `https://will-hill-leaderboard.<your-subdomain>.workers.dev`.

## Point the game at it

Set `LB_URL` in `src/net/leaderboard.js` to the deployed Worker URL (currently empty — the client silently no-ops the leaderboard until it's set, same graceful-fallback behavior as the Jandé game).

## Test the API directly

```bash
BASE=https://will-hill-leaderboard.<your-subdomain>.workers.dev
curl -s "$BASE/top?n=10"
curl -s -X POST "$BASE/submit" -H 'Content-Type: application/json' \
  -d '{"name":"TEST","events":[{"t":100,"type":"bag"}],"durationMs":5000,"phone":"","email":""}'
```

## Endpoints

- `GET /top?n=20` → `{ ok, runs:[{name, score}] }` — public, never includes phone/email.
- `POST /submit` `{ name, events, durationMs, phone, email }` → `{ ok, rank, score }` — score is recomputed server-side from `events`, never trusted from the client.
