-- Storage for the cli adapter, which has no chat client to push into so it
-- writes delivered mail here instead. Only needed for databases created
-- before this table existed; schema.sql already includes it for fresh
-- installs, and self-hosted SQLite picks it up automatically on next start.
--
--   wrangler d1 execute cinderbox --remote --file=migrations/0003_add_cli_messages.sql

CREATE TABLE IF NOT EXISTS cli_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  address TEXT NOT NULL,
  from_address TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  read INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_cli_messages_address ON cli_messages(address);
