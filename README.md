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

## Pick a setup

Three ways to run it. All three deliver to Discord identically, the difference is only where addresses live and where the code runs.

| | Addresses on | Runs on | You need |
|---|---|---|---|
| **[Cloudflare](docs/deploy-cloudflare.md)** | your domain | Cloudflare | a domain, a Cloudflare account |
| **[Cloudflare, mail.tm mode](docs/deploy-cloudflare.md#mailtm-mode-no-domain)** | mail.tm's domain | Cloudflare | a Cloudflare account |
| **[Self-hosted](docs/deploy-selfhost.md)** | your domain | your own machine | a domain, a server, port 25 |

The two Cloudflare rows are the same Worker and the same guide. One setting (`DISPOSABLE_DOMAIN`) decides which mode it runs in, so you can switch later without redeploying.

**No domain?** Use mail.tm mode. Its one real drawback: mail.tm is a known disposable-mail provider, so some signup forms recognize and block its domain. Running your own domain is what avoids that.

**Don't want Cloudflare?** Self-hosted is the only path with no Cloudflare account at all.

## Quick start

```bash
npm install && npm run setup
```

Asks which of the three you want, then writes the config file for you.

Or skip the clone entirely and deploy straight to Cloudflare:

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Psalm2517/Cindermail)

The button creates a D1 database and prompts for your Discord secrets, but it does not finish the job. Four things are still on you afterward, and none are optional: load the schema, set (or clear) `DISPOSABLE_DOMAIN` to pick a mode, wire up Email Routing if you chose a domain, and register the Discord commands. [docs/deploy-cloudflare.md](docs/deploy-cloudflare.md) covers all four in order.

## Then set up Discord

Every path ends the same way: [docs/discord-adapter.md](docs/discord-adapter.md). That's where the commands (`/new` `/list` `/extend` `/torch`) are documented too.

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
