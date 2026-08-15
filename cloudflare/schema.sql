-- WILL HILL: PLAYER ONE — contest database.
--
--   wrangler d1 execute will-hill-contest --remote --file=cloudflare/schema.sql
--
-- ⚠️ THREE TABLES, AND THE SPLIT IS THE POINT. `runs` is what the public board
-- reads and carries NO contact details of any kind. `entrants` holds the phone
-- and the email and is only ever read by the dashboard worker. Nothing joins
-- them on the public path, so the public endpoint cannot leak a phone number
-- even if somebody writes a careless query later — the column is not in the
-- table it selects from.

-- The public board. One row per person, holding their BEST score.
-- `id` is a SHA-256 of their phone number, never the number itself, so this
-- whole table can be served to anybody.
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
