<div align="center">

# Cindermail 🔥

**Disposable email delivered to chat, not another inbox to check.**

[![Release](https://img.shields.io/github/v/release/Psalm2517/Cindermail)](https://github.com/Psalm2517/Cindermail/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![CI](https://github.com/Psalm2517/Cindermail/actions/workflows/ci.yml/badge.svg)](https://github.com/Psalm2517/Cindermail/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-f38020.svg?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com)
[![Stars](https://img.shields.io/github/stars/Psalm2517/Cindermail)](https://github.com/Psalm2517/Cindermail/stargazers)


</div>

---

Give out `x7k2p9qzrm@yourdomain.com` instead of your real address. Whatever gets sent to it is parsed, cleaned up, and delivered to your Discord DMs. Torch it when you're done.

![Example delivery](docs/images/example-dm.png)

Addresses live on **a domain you own**, so unlike public temp-mail services nothing recognizes them as disposable and blocks them. Mail lands in **Discord**, not another inbox you have to remember to check. It all runs on **Cloudflare's free tier**: Email Routing receives, D1 stores, one Worker does the rest. There's no server to keep alive.

No domain? It runs on mail.tm's domain instead, with nothing to buy. Same Worker, one setting.

## Deploy

```bash
git clone https://github.com/Psalm2517/Cindermail.git
cd Cindermail
npm install && npm run setup
```

The wizard asks for your domain (or skips it for mail.tm mode), creates the D1 database, and sets your Discord secrets. Then load the schema, deploy, point your domain at Email Routing, and register the slash commands: [docs/deploy-cloudflare.md](docs/deploy-cloudflare.md) walks through all of it, then [docs/discord-adapter.md](docs/discord-adapter.md) for the Discord side.

<details>
<summary>There's also a Deploy to Cloudflare button, but read this first</summary>

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Psalm2517/Cindermail)

It forks the repo, creates a database, and deploys a Worker without you touching a terminal. It does not finish the job, and it isn't less work overall.

Registering the slash commands is a script in this repo with no dashboard equivalent, so you need a local clone regardless. On top of that the button deploys with whatever `wrangler.jsonc` currently holds, which is this project's own domain, not yours, so you'll be editing config and redeploying anyway.

Worth it if you specifically want the Worker and database provisioned for you. Otherwise the clone above gets you to the same place with fewer corrections.

</details>

## Commands

| | |
|---|---|
| `/new [expiry] [note]` | A fresh address. Permanent unless you give it an expiry in days. |
| `/list` | Everything you own, with notes and expiry dates. |
| `/extend <address> [expiry]` | Change when one expires, or `expiry: 0` to make it permanent. |
| `/note <address> [note]` | Label one so `/list` tells you what it was for. |
| `/remind [enabled]` | Opt in to a DM about a day before an address expires. |
| `/torch <address>` | Kill it. |

Every reply is ephemeral, visible only to whoever ran the command. Full details in [docs/discord-adapter.md](docs/discord-adapter.md).

## How it works

1. `/new` generates a random address and ties it to whoever ran the command.
2. Give that address to whatever's asking for an email, a signup form, a newsletter, whatever. Mail sent to it always comes back to you, not wherever you gave it out.
3. Mail arrives. The Worker looks up the owner. Missing, expired, or torched: dropped, no bounce, nothing logged.
4. Valid: the mail gets parsed (HTML to readable text, links intact, attachments forwarded) and delivered.

A daily cron clears expired and torched addresses along with stale rate-limit rows, and sends expiry reminders to anyone who asked for them.

The Worker also serves a small status page at its root with running totals, plus the same numbers as JSON at `/counters`. No addresses or owners are exposed, just counts.

## Limits

- 5 active addresses per owner, configurable. Torch one to make room.
- Message bodies cap at 1500 characters inline, longer gets attached as `message.txt`.
- Inbound HTML caps at 256KB before parsing (parsing cost scales quadratically with input, and addresses are reachable by anyone who learns one).
- Attachments forward individually up to 25MB combined per email. Over budget gets dropped with a note, not the whole batch.

Code layout, tests, and how to add a delivery adapter: [docs/architecture.md](docs/architecture.md). Every setting: [docs/configuration.md](docs/configuration.md).

## License

MIT. See [LICENSE](./LICENSE).
