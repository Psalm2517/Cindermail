<div align="center">

# Cindermail 🔥

**Disposable email delivered to chat, not another inbox to check.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![CI](https://github.com/Psalm2517/Cindermail/actions/workflows/ci.yml/badge.svg)](https://github.com/Psalm2517/Cindermail/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-f38020.svg?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com)


</div>

---

Give out `x7k2p9qzrm@yourdomain.com` instead of your real address. Whatever gets sent to it is parsed, cleaned up, and delivered to your Discord DMs. Torch it when you're done.

![Example delivery](docs/images/example-dm.png)

Addresses live on **a domain you own**, so unlike public temp-mail services nothing recognizes them as disposable and blocks them. Mail lands in **Discord**, not another inbox you have to remember to check. It all runs on **Cloudflare's free tier**: Email Routing receives, D1 stores, one Worker does the rest. There's no server to keep alive.

No domain? It runs on mail.tm's domain instead, with nothing to buy. Same Worker, one setting.

## Deploy

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Psalm2517/Cindermail)

One click gets you a Worker and a database. It doesn't finish the job on its own: you still need to load the schema, point `DISPOSABLE_DOMAIN` at your domain (or clear it for mail.tm mode), wire up Email Routing, and register the Discord commands.

Prefer to do it locally, or want the wizard to handle the config?

```bash
npm install && npm run setup
```

Either way, [docs/deploy-cloudflare.md](docs/deploy-cloudflare.md) is the walkthrough, then [docs/discord-adapter.md](docs/discord-adapter.md) for the Discord side and the commands (`/new` `/list` `/extend` `/torch`).

## How it works

1. `/new` generates a random address and ties it to whoever ran the command.
2. Give that address to whatever's asking for an email, a signup form, a newsletter, whatever. Mail sent to it always comes back to you, not wherever you gave it out.
3. Mail arrives. The Worker looks up the owner. Missing, expired, or torched: dropped, no bounce, nothing logged.
4. Valid: the mail gets parsed (HTML to readable text, links intact, attachments forwarded) and delivered.

A daily cron clears expired and torched addresses along with stale rate-limit rows.

## Limits

- Addresses are permanent by default. `/new expiry: 7` gives you one that expires in 7 days instead.
- `/new note: netflix trial` labels an address so `/list` tells you what it was for.
- 5 active addresses per owner, configurable. Torch one to make room.
- Message bodies cap at 1500 characters inline, longer gets attached as `message.txt`.
- Inbound HTML caps at 256KB before parsing (parsing cost scales quadratically with input, and addresses are reachable by anyone who learns one).
- Attachments forward individually up to 25MB combined per email. Over budget gets dropped with a note, not the whole batch.

Code layout, tests, and how to add a delivery adapter: [docs/architecture.md](docs/architecture.md). Every setting: [docs/configuration.md](docs/configuration.md).

## License

MIT. See [LICENSE](./LICENSE).
