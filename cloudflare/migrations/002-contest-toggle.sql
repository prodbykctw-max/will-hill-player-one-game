-- 002 — the contest on/off switch.
--
-- Client: "there should be a switch on the dashboard that allows them to
-- turn the contest on or off. That's the simplest way to do it."
--
-- Run this BEFORE deploying a leaderboard/dashboard worker that reads or
-- writes this table, or the leaderboard worker's contestOpen() throws on
-- "no such table" and every /submit fails closed, and the dashboard's
-- /toggle does the same:
--
--   wrangler d1 execute will-hill-contest --remote \
--     --file=cloudflare/migrations/002-contest-toggle.sql
--
-- Only needed on a database that already exists. A fresh one gets this table
-- from schema.sql's own CREATE TABLE, and running this against one errors
-- with "table contest_state already exists" — harmless, the sign it's
-- already there. Starts CLOSED (0) either way — nothing is live until the
-- switch is flipped from the dashboard.
CREATE TABLE IF NOT EXISTS contest_state (
  id   INTEGER PRIMARY KEY CHECK (id = 1),
  open INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO contest_state (id, open) VALUES (1, 0);
