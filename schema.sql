CREATE TABLE IF NOT EXISTS addresses (
  address TEXT PRIMARY KEY,
  owner_type TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  revoked_at INTEGER,
  -- Opaque, receiver-specific data (JSON). NULL for addresses created on your
  -- own domain (Cloudflare Email Routing, self-hosted SMTP). Set for
  -- addresses provisioned through a third-party receiver like mail.tm, which
  -- needs to remember a password to poll for mail and an account id to clean
  -- up after itself. Core never reads or writes this column.
  receiver_data TEXT
);
CREATE INDEX IF NOT EXISTS idx_addresses_owner ON addresses(owner_type, owner_id);

CREATE TABLE IF NOT EXISTS rate_limits (
  owner_type TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  action TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (owner_type, owner_id, action)
);

-- Delivered mail for the cli adapter, which has no chat client to push into
-- so it stores messages here for `cindermail messages`/`read` to pull from.
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
