-- Running totals for the public counter page: total addresses ever created,
-- total ever torched. A single row rather than a live COUNT(*), since
-- cleanup physically deletes expired/torched rows and a live count would
-- lose history as soon as that runs. Only needed for databases created
-- before this table existed; schema.sql already includes it for fresh
-- installs.
--
--   wrangler d1 execute cinderbox --remote --file=migrations/0004_add_counters.sql
--   (or against your local SQLite file for a self-hosted deployment)

CREATE TABLE counters (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  created INTEGER NOT NULL DEFAULT 0,
  torched INTEGER NOT NULL DEFAULT 0
);
INSERT INTO counters (id, created, torched) VALUES (1, 0, 0);
