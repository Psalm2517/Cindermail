-- An optional user-supplied label for an address ("netflix signup"), shown
-- next to it in /list so a list of random local parts is actually readable.
-- Only needed for databases created before this column existed; schema.sql
-- already includes it for fresh installs.
--
--   wrangler d1 execute cinderbox --remote --file=migrations/0006_add_note.sql

ALTER TABLE addresses ADD COLUMN note TEXT;
