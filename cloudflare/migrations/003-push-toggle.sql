-- 003 — the ALERT switch, for push notifications.
--
-- Client: "their ability to turn on notification should be the alert switch
-- inside of the cab... switch on and off with a click sound for push
-- notifications."
--
-- Run this BEFORE deploying a dashboard worker that reads or writes this
-- table, or POST /push-toggle fails closed the same way /toggle does without
-- contest_state:
--
--   wrangler d1 execute will-hill-contest --remote \
--     --file=cloudflare/migrations/003-push-toggle.sql
--
-- Only needed on a database that already exists. A fresh one gets this table
-- from schema.sql's own CREATE TABLE, and running this against one errors
-- with "table push_state already exists" — harmless, the sign it's already
-- there. Starts OFF either way — no notification goes out until the switch
-- on the dashboard is flipped.
CREATE TABLE IF NOT EXISTS push_state (
  id      INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO push_state (id, enabled) VALUES (1, 0);
