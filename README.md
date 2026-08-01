<div align="center">

# Cindermail 🔥

**A disposable email service you run yourself. Give out addresses on your own domain, get the mail delivered somewhere you actually check.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org)

</div>

---

Give out `x7k2p9qzrm@yourdomain.com` instead of your real address. Anything sent to it gets parsed, cleaned up, and delivered to you. No inbox to check, no account to log into. When you're done with it, torch it.

## What's actually going on here

Cindermail is built as two things bolted together, on purpose:

1. **The core.** Handles address creation, expiry, rate limiting, and parsing incoming mail. It has no idea where the mail ends up or how it arrived. It's just plumbing.
2. **Two pluggable pieces** that hang off that core:
   - A **delivery adapter** decides where parsed mail goes. Right now there's exactly one: Discord DMs. That's the only option today, not a permanent limitation, and it's why setting up Discord is a required step no matter how you run the rest of this.
   - A **receiving/storage backend** decides how mail actually arrives and where address data lives. Two exist: Cloudflare (Email Routing + D1, nothing to host yourself) and self-hosted (a plain SMTP server + a SQLite file, runs on any machine you control).

So there are really two separate decisions to make, not one:

- **Where does mail get received and stored?** Cloudflare, or your own server. Pick one.
- **Where does mail get delivered to you?** Discord, currently the only choice, so this part isn't really a decision yet.

## Setup guides

Because those are two separate questions, the setup steps live in two separate documents instead of getting tangled together:

- **[Deploying on Cloudflare Workers](docs/deploy-cloudflare.md)**: no server to run yourself, Workers and D1 are free at this scale, you just need a Cloudflare account and a domain.
- **[Self-hosting on your own server](docs/deploy-selfhost.md)**: no Cloudflare account needed at all, but you're responsible for a machine that can receive mail on port 25 and stays running.
- **[Setting up the Discord adapter](docs/discord-adapter.md)**: the same steps regardless of which of the two above you picked. Do this one either way, since it's currently the only way mail actually reaches you.

Do one hosting guide plus the Discord guide and you're running.

## Commands

All replies are ephemeral, meaning only you can see them.

| Command | What it does | Default rate limit |
|---|---|---|
| `/new` | Creates a disposable address. Caps out at 5 active at once. | 1 per 30 seconds |
| `/list` | Lists your active addresses and when they expire. | 15 per 60 seconds |
| `/extend <address>` | Pushes the expiry out another 7 days. | 15 per 60 seconds |
| `/torch <address>` | Revokes an address right away. | 15 per 60 seconds |

Addresses expire 7 days after creation (or after your last `/extend`) whether you torch them or not. Every one of these numbers is a configurable default, not a hardcoded rule. See the [configuration reference](docs/configuration.md).

## How it works

1. `/new` generates a random address and stores who owns it.
2. You hand that address out somewhere.
3. Mail arrives at your domain's catch-all. Whatever's receiving it (Cloudflare or your own SMTP server) hands it off to the core, which looks up the owner. If the address is missing, expired, or torched, the mail just gets dropped. No bounce, nothing logged.
4. If the address is valid, the parsed mail (HTML converted to readable text, links kept intact, attachments forwarded) goes out through whichever delivery adapter is enabled.

A daily cleanup job clears out expired and torched addresses, plus old rate-limit rows, on both hosting paths.

## Architecture

```
src/core/             The engine. Address CRUD, rate limiting, dispatch, MIME
                       parsing. Imports nothing from adapters/ or storage/,
                       only ever talks to the interfaces defined in core/.
src/core/storage.ts    SqlExecutor: the small run/first/all interface core
                        runs SQL against. D1 and SQLite both speak SQLite
                        dialect, so every query in core/db.ts and
                        core/ratelimit.ts is shared word for word between
                        them. Two thin drivers, one set of business logic.
src/storage/           The two SqlExecutor implementations: d1.ts and
                        sqlite.ts (via better-sqlite3).
src/adapters/          Delivery adapters. discord/ ships built in.
src/worker.ts           Cloudflare entrypoint.
src/node/               Self-hosted entrypoint: an SMTP server, a plain
                         HTTP server for the Discord webhook, and a cleanup
                         schedule that matches the Cloudflare cron timing.
```

## Extending it

**Adding a delivery adapter.** Implement `MailAdapter` in `src/core/types.ts`: a `name` and a `deliver(owner, mail)` that returns `{ success, error? }` and never throws. Register it in `buildAdapters()` in both entrypoints. That's the whole contract. Core doesn't need to know anything else about it.

**Adding a storage or receiving backend.** Implement `SqlExecutor` in `src/core/storage.ts` against whatever SQL engine you want, `schema.sql` already works against anything SQLite-dialect-compatible. Pair it with something that calls `handleInboundEmail({ to, from, raw }, db, dispatcher)` in `core/email.ts` for each piece of mail that comes in. `raw` accepts a `Buffer`, a `ReadableStream`, a string, whatever `postal-mime` takes, which covers most real receiving mechanisms without extra glue code.

## Limits

- 5 active addresses per owner by default, 7 day expiry. Both configurable.
- Discord DM bodies are 1500 characters inline. Anything longer gets attached as `message.txt`.
- Inbound HTML is capped at 256KB before parsing. Email parsing gets slower quadratically as input grows, and addresses are reachable by anyone who learns one, so this keeps worst case CPU bounded instead of rejecting large mail outright.
- Attachments forward individually up to a combined 25MB per email. Anything over budget gets dropped with a note instead of throwing out the whole batch.

## License

MIT. See [LICENSE](./LICENSE).
