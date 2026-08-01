-- Records when an address was revoked, so cleanup can drop revoked rows a
-- grace period after revocation instead of waiting out their original expiry.
-- Only needed for databases created before this column existed; schema.sql
-- already includes it for fresh installs.
--
--   wrangler d1 execute cinderbox --remote --file=migrations/0001_add_revoked_at.sql

ALTER TABLE addresses ADD COLUMN revoked_at INTEGER;
