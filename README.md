<div align="center">

# Cindermail 🔥

**Disposable email delivered to chat, not another inbox to check.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![CI](https://github.com/Psalm2517/Cindermail/actions/workflows/ci.yml/badge.svg)](https://github.com/Psalm2517/Cindermail/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-f38020.svg?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com)


</div>

---

Give out `x7k2p9qzrm@yourdomain.com` instead of your real address. Whatever gets sent to it is parsed, cleaned up, and delivered to you. Torch it when you're done.

![Example delivery](docs/images/example-dm.png)

## Quick start

```bash
npm install && npm run setup
```

Asks which way you want to receive mail, then writes the config file for you. The default path needs no domain, no DNS, and no server.

## Two moving parts

A core that generates addresses, tracks who owns them, parses incoming mail, and doesn't care where any of it came from or where it's going. Two things plug into it:

- **Where mail comes from.** mail.tm (no domain, no server), your own server (SMTP + SQLite), or Cloudflare (Email Routing + D1). The last two run addresses on a domain you own.
- **Where mail goes.** Discord.

## Setup guides

- **[mail.tm](docs/deploy-mailtm.md)**: quickest, no domain or server at all. Read the caveat in that guide first, mail.tm's domain is a known temp-mail domain and some signup forms block it. [Runs on Cloudflare Workers too](docs/deploy-cloudflare-mailtm.md) if you'd rather not keep a Node process alive yourself.
- **[Cloudflare Workers](docs/deploy-cloudflare.md)**: your own domain, no server to run, just a Cloudflare account. A [Deploy to Cloudflare button](#deploy-to-cloudflare) is also available if you'd rather skip cloning the repo.
- **[Self-hosted](docs/deploy-selfhost.md)**: your own machine, your own domain, your own uptime.
- **[Discord setup](docs/discord-adapter.md)**: same steps regardless of which of the above you picked. Commands (`/new` `/list` `/extend` `/torch`) are documented there.

## Deploy to Cloudflare

A shortcut for the Cloudflare Workers path above, not a separate way to get started. If you're not already set on Cloudflare, use Quick start instead.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Psalm2517/Cindermail)

Forks this repo into your own Cloudflare account, creates a brand new D1 database (does not touch this project's own database), deploys the Worker, and prompts you for the three Discord secrets. Still required afterward, none of it optional:

1. Load the database schema. The button doesn't run `schema.sql`, your new database is empty until you run `npx wrangler d1 execute cinderbox --remote --file=schema.sql` yourself.
2. Pick a mode. The deployed Worker runs whichever way [wrangler.jsonc](wrangler.jsonc)'s `DISPOSABLE_DOMAIN` is set, which starts out as this project's domain, not yours. In the Cloudflare dashboard, under the Worker's Settings, either set it to a domain you own or clear it entirely to run on mail.tm with no domain at all.
3. Only if you set a domain: point it at Cloudflare Email Routing, then add a catch-all rule targeting the new Worker. Nothing to do here in mail.tm mode.
4. Register the Discord commands (`npm run register-commands`) and set the Interactions Endpoint URL in the Discord Developer Portal.

Full walkthrough, in order: [docs/deploy-cloudflare.md](docs/deploy-cloudflare.md) for the domain-based mode, [docs/deploy-cloudflare-mailtm.md](docs/deploy-cloudflare-mailtm.md) for mail.tm mode.

## How it works

1. `/new` generates a random address and ties it to whoever ran the command.
2. Give that address to whatever's asking for an email, a signup form, a newsletter, whatever. Mail sent to it always comes back to you, not wherever you gave it out.
3. Mail arrives. The receiver looks up the owner. Missing, expired, or torched: dropped, no bounce, nothing logged.
4. Valid: the mail gets parsed (HTML to readable text, links intact, attachments forwarded) and delivered.

Daily cleanup clears expired/torched addresses and stale rate-limit rows, on every path.

## Limits

- 5 active addresses per owner, 10 day expiry. Both configurable, and `/new permanent: true` opts a single address out of expiry entirely.
- Message bodies cap at 1500 characters inline, longer gets attached as `message.txt`.
- Inbound HTML caps at 256KB before parsing (parsing cost scales quadratically with input, and addresses are reachable by anyone who learns one).
- Attachments forward individually up to 25MB combined per email. Over budget gets dropped with a note, not the whole batch.

Code layout and how to add an adapter or backend: [docs/architecture.md](docs/architecture.md).

## License

MIT. See [LICENSE](./LICENSE).
