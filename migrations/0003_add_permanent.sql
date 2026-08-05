-- Marks an address as never-expiring: good until torched. Cleanup skips these
-- rows entirely, and /new and /extend can both set or clear the flag. Only
-- needed for databases created before this column existed; schema.sql already
-- includes it for fresh installs.
--
--   wrangler d1 execute cinderbox --remote --file=migrations/0003_add_permanent.sql
--   (or against your local SQLite file for a self-hosted deployment)

ALTER TABLE addresses ADD COLUMN permanent INTEGER NOT NULL DEFAULT 0;
