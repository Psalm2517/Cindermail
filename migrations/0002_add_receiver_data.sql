-- Opaque, receiver-specific data (JSON), used by receivers that need to
-- remember credentials or an external account id, such as mail.tm. NULL for
-- addresses on your own domain. Only needed for databases created before
-- this column existed; schema.sql already includes it for fresh installs.
--
--   wrangler d1 execute cinderbox --remote --file=migrations/0002_add_receiver_data.sql
--   (or against your local SQLite file for a self-hosted deployment)

ALTER TABLE addresses ADD COLUMN receiver_data TEXT;
