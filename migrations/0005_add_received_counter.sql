-- Running total of emails received for a live (not expired/revoked) address,
-- shown on the public counter page. Only needed for databases created before
-- this column existed; schema.sql already includes it for fresh installs.
--
--   wrangler d1 execute cinderbox --remote --file=migrations/0005_add_received_counter.sql
--   (or against your local SQLite file for a self-hosted deployment)

ALTER TABLE counters ADD COLUMN received INTEGER NOT NULL DEFAULT 0;
