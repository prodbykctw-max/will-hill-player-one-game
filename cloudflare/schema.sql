-- WILL HILL: PLAYER ONE — contest database.
--
--   wrangler d1 execute will-hill-contest --remote --file=cloudflare/schema.sql
--
-- ⚠️ FOUR TABLES, AND THE SPLIT IS THE POINT. `runs` is what the public board
-- reads and carries NO contact details of any kind. `entrants` holds the phone
-- and the email and is only ever read by the dashboard worker. Nothing joins
-- them on the public path, so no careless query can put a phone NUMBER on the
-- public endpoint — the column is not in the table it selects from.
--
-- ⚠️ THAT IS A NARROWER GUARANTEE THAN IT SOUNDS, AND THE GAP WAS LIVE. It
-- says nothing about `runs.id`, which is DERIVED from the phone number, and
-- /top was selecting it. See the warning on `runs` below. The wall stops a
-- column crossing; it does not stop a reversible encoding of that column
-- being published from this side of it.

-- ⚠️ AND A FIFTH, `run_stats`, ADDED BEFORE THE DATABASE EVER EXISTED —
-- which is the only cheap moment to add a table to a contest. Client: "can we
-- count stats like how many deaths over throughout the entire time of you
-- playing, how many kills… how can we keep stats and metrics like that?"
--
-- One row per SUBMITTED RUN, tallied from the same event log the score is
-- recomputed from, so no new data is collected and nothing extra is sent. It
-- carries the opaque `id`, never a phone number, so it sits on the same side
-- of the wall as `runs`.

-- The public board. One row per person, holding their BEST score.
--
-- ⚠️ `id` IS A SHA-256 OF THEIR PHONE NUMBER, AND THAT DOES NOT MAKE IT SAFE
-- TO PUBLISH. This comment used to end "never the number itself, so this whole
-- table can be served to anybody", and /top duly selected it. A hash is only
-- one-way when the input is unguessable: this one is "whp1:" + ten digits,
-- fixed prefix, no per-entrant salt, drawn from about 10^10 possibilities. A
-- complete table of every possible input is minutes on a GPU, so publishing
-- the hash publishes the number.
--
-- Serve `name` and `score`. `id` is an internal key — fine in the dashboard,
-- which is token-gated and shows the real number anyway; never in /top.
CREATE TABLE IF NOT EXISTS runs (
  id       TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  score    INTEGER NOT NULL,
  updated  INTEGER NOT NULL,          -- ms epoch of their best run
  created  INTEGER NOT NULL,          -- ms epoch they first appeared
  plays    INTEGER NOT NULL DEFAULT 1 -- how many runs they have submitted
);
-- The board's only ordering: highest score, earliest to reach it wins ties.
CREATE INDEX IF NOT EXISTS runs_board ON runs (score DESC, updated ASC);

-- PRIVATE. How to reach a winner. Dashboard worker only.
CREATE TABLE IF NOT EXISTS entrants (
  id       TEXT PRIMARY KEY,
  phone    TEXT NOT NULL,
  email    TEXT,
  name     TEXT,
  created  INTEGER NOT NULL,
  seen     INTEGER NOT NULL
);

-- ⚠️ REPLAY PROTECTION. Every run carries a UUID minted when it STARTS. A
-- submitted log can otherwise be posted again verbatim — including somebody
-- else's good run under your own phone number, which is the cheapest possible
-- way to cheat this contest and needs no skill at all. The primary key does
-- the work: a second insert of the same id fails, and the submit is refused.
CREATE TABLE IF NOT EXISTS seen_runs (
  run_id   TEXT PRIMARY KEY,
  id       TEXT NOT NULL,
  t        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS seen_runs_t ON seen_runs (t);

-- Every refusal, with its reason. Not for tidiness — it is how the dashboard
-- shows abuse happening DURING the contest rather than after it, which is the
-- only time the information is worth anything.
CREATE TABLE IF NOT EXISTS rejects (
  t        INTEGER NOT NULL,
  reason   TEXT NOT NULL,
  detail   TEXT,
  ip       TEXT
);
CREATE INDEX IF NOT EXISTS rejects_t ON rejects (t DESC);

-- ── STATS ────────────────────────────────────────────────────────────────
--
-- One row per submitted run, tallied server-side from the event log that was
-- already being walked to recompute the score. Nothing new is collected: the
-- client sends the same log it always did, and the same arithmetic runs on
-- both ends (src/net/leaderboard.js tallyLog), so the device's lifetime
-- numbers and the dashboard's cannot disagree about what happened — only
-- about which runs reached the network.
--
-- ⚠️ NO PHONE, NO EMAIL, NO NAME. Keyed on the same opaque `id` as `runs`, so
-- this table lives on the public side of the wall and a careless join later
-- still cannot leak a way to contact anybody.
--
-- ⚠️ THESE NUMBERS ARE PLAYER-REPORTED. The SCORE is revalidated (the Worker
-- recomputes it and refuses implausible logs), but a determined person could
-- inflate their own kill count without gaining a point. Fine for a dashboard,
-- not evidence — do not pay anybody on the strength of a stat.
CREATE TABLE IF NOT EXISTS run_stats (
  run_id     TEXT PRIMARY KEY,        -- the run's own UUID; one row per run
  id         TEXT NOT NULL,           -- opaque player id, joins to runs.id
  t          INTEGER NOT NULL,        -- ms epoch of the submission
  score      INTEGER NOT NULL,
  duration   INTEGER NOT NULL,        -- run length in ms
  bags       INTEGER NOT NULL DEFAULT 0,
  bags_x2    INTEGER NOT NULL DEFAULT 0,
  bags_lost  INTEGER NOT NULL DEFAULT 0,
  kills      INTEGER NOT NULL DEFAULT 0,
  bottles    INTEGER NOT NULL DEFAULT 0,
  potholes   INTEGER NOT NULL DEFAULT 0,
  continues  INTEGER NOT NULL DEFAULT 0,
  deaths     INTEGER NOT NULL DEFAULT 0,
  death_enemy   INTEGER NOT NULL DEFAULT 0,
  death_pothole INTEGER NOT NULL DEFAULT 0,
  death_fall    INTEGER NOT NULL DEFAULT 0,
  stages     INTEGER NOT NULL DEFAULT 0,  -- stages cleared in this run
  best_stage INTEGER NOT NULL DEFAULT 0,  -- furthest stage reached (1-4)
  -- ⚠️ MAX COMBO IS HERE BEFORE THE GAME CAN PRODUCE ONE, ON PURPOSE. Client:
  -- "underneath BAGS LOST I wanna add MAX COMBO there, because I plan on
  -- working a combo system into the game." There is no combo system yet, so
  -- every row written today holds 0 and the dashboard shows 0. The column
  -- costs nothing now and costs a migration on a live contest database later
  -- — the same reason run_stats itself was created before the database was.
  -- The contract the game has to meet is one `combo` event per run carrying
  -- the best chain of that run in `n`; see statsFromEvents.
  max_combo  INTEGER NOT NULL DEFAULT 0,  -- best chain in this run
  -- ── WHERE THE RUN CAME FROM ────────────────────────────────────────────
  --
  -- Client: "I want a world map that zooms in to city level and I wanna be
  -- able to see what city each contestant is playing from."
  --
  -- Cloudflare hands every request a `cf` object with this already resolved —
  -- no lookup, no third party, no extra round trip, and nothing asked of the
  -- player. It is recorded HERE, on the opaque-id side of the wall, and
  -- deliberately NOT on `entrants` beside the phone number: if this table
  -- ever leaked it says "somebody played from Decatur", not who.
  --
  -- ⚠️ EDGE GEO IS NOT GPS, AND THE DASHBOARD SAYS SO. It resolves the
  -- network, not the person: a player on cellular frequently lands on their
  -- carrier's hub city, and a VPN reports wherever it exits. Good for "the
  -- Southeast is lit up"; not evidence of where anybody lives.
  city       TEXT,
  region     TEXT,
  country    TEXT,
  lat        REAL,
  lon        REAL
);
-- The map groups by city; this is the index that makes that cheap.
CREATE INDEX IF NOT EXISTS run_stats_city ON run_stats (country, region, city);
-- The dashboard reads these two ways: newest first, and grouped per player.
CREATE INDEX IF NOT EXISTS run_stats_t ON run_stats (t DESC);
CREATE INDEX IF NOT EXISTS run_stats_id ON run_stats (id);


-- ── MIGRATIONS ───────────────────────────────────────────────────────────
--
-- ⚠️ `CREATE TABLE IF NOT EXISTS` DOES NOTHING TO A TABLE THAT ALREADY
-- EXISTS. Re-running this file against a database that already holds real
-- runs will NOT add a column added above — it silently does nothing, and then
-- the dashboard's funnel query fails with "no such column: max_combo", /data
-- 500s, and the page goes blank with the contest live.
--
-- ⚠️ AND THE FIX DOES NOT LIVE IN THIS FILE. An `ALTER TABLE` here would make
-- this file fail on a FRESH database, because the CREATE above already has
-- the column — so the one command that has to keep working forever would
-- stop. Each migration is its own file in cloudflare/migrations/, run once,
-- BEFORE the worker that reads the new column is deployed:
--
--   wrangler d1 execute will-hill-contest --remote \
--     --file=cloudflare/migrations/001-max-combo.sql
--
-- A second run errors with "duplicate column name", which is harmless and is
-- how you know it already applied.
