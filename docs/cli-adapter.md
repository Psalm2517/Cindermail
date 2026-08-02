# CLI adapter

An alternative to the Discord adapter for people who'd rather manage addresses and read mail from a terminal than a chat app. Delivered mail has nowhere to push to, so it's written to the local SQLite database and read back on demand.

Single-user: every address created through the CLI shares one fixed local owner, since there's no per-user identity like a Discord account to key on.

## Setup

Add `cli` to `ADAPTERS` (alongside or instead of `discord`) in your `.env`, then run the self-hosted server (`npm run start`) or the mail.tm one (`npm run start:mailtm`) as usual. If `discord` isn't in `ADAPTERS`, the three `DISCORD_*` variables aren't required.

The CLI itself is a separate command, run against the same SQLite file:

```
npm run cli -- new
npm run cli -- list
npm run cli -- extend <address>
npm run cli -- torch <address>
npm run cli -- messages <address>
npm run cli -- read <id>
```

## Commands

- `new`: creates an address. Uses `DISPOSABLE_DOMAIN` if set (self-hosted), otherwise provisions one through mail.tm.
- `list`: active addresses and their remaining time.
- `extend <address>`: pushes expiry back out by the configured TTL.
- `torch <address>`: revokes it immediately.
- `messages <address>`: delivered mail for that address, newest first. `*` marks unread.
- `read <id>`: prints the full message and marks it read.

## Limits

Text only. Attachments aren't saved; a note in the body says how many were dropped. HTML is converted to readable text the same way the Discord adapter does it, capped at 256KB before parsing for the same reason (addresses are reachable by anyone who learns one).
