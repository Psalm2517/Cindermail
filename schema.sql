CREATE TABLE addresses (
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
CREATE INDEX idx_addresses_owner ON addresses(owner_type, owner_id);

CREATE TABLE rate_limits (
  owner_type TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  action TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (owner_type, owner_id, action)
);
