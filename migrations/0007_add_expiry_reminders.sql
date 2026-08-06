-- Opt-in DM reminders sent ~a day before an address expires.
--
-- expiry_warned_at records when a reminder went out, so a second cron run
-- can't send a duplicate. NULL means not yet warned; extendAddress clears it
-- back to NULL so an extended address can warn again on its new expiry.
--
-- owner_preferences holds per-owner settings. A missing row means every
-- setting is off, which is what makes reminders opt-in: nobody gets a DM
-- they didn't ask for.
--
-- Only needed for databases created before these existed; schema.sql already
-- includes them for fresh installs.
--
--   wrangler d1 execute cinderbox --remote --file=migrations/0007_add_expiry_reminders.sql

ALTER TABLE addresses ADD COLUMN expiry_warned_at INTEGER;

CREATE TABLE owner_preferences (
  owner_type TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  expiry_reminders INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (owner_type, owner_id)
);
