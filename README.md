<div align="center">

# Cinderbox

**Disposable email addresses on your own domain, delivered straight to your Discord DMs.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-f38020.svg?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com)

</div>

---

Give out `x7k2p9qzrm@yourdomain.com` instead of your real address. Anything sent to it gets parsed, cleaned up, and DMed to you — no inbox to check, no account to log into. When you're done with it, torch it.

Built as a single Cloudflare Worker: Email Routing catches inbound mail, D1 tracks who owns which address, and a pluggable adapter handles delivery. Discord is the only adapter that ships, but the core has no idea Discord exists — see [Adding an adapter](#adding-an-adapter).

## Commands

All replies are ephemeral (only you see them).

| Command | Description | Rate limit |
|---|---|---|
| `/new` | Create a disposable address. Max 5 active at once. | 1 / 30s |
| `/list` | List your active addresses and when they expire. | 15 / 60s |
| `/extend <address>` | Push expiry out another 7 days. | 15 / 60s |
| `/torch <address>` | Revoke an address immediately. | 15 / 60s |

Addresses expire 7 days after creation (or after the last `/extend`) whether you torch them or not.

## How it works

1. `/new` generates a random 10-character local part and stores `address -> Discord user` in D1.
2. You hand that address out somewhere.
3. Mail arrives at your domain's catch-all. Cloudflare Email Routing hands it to the Worker, which looks up the owner and drops it silently if the address is missing, expired, or torched — no bounce, no logging of content.
4. The parsed mail (HTML converted to readable text, links preserved, attachments forwarded) goes out as a Discord DM.

A daily cron sweeps expired/torched addresses (24h grace period) and stale rate-limit rows.

## Self-hosting

### Requirements

- Node.js 18+
- A Cloudflare account, with the domain you want to use already added as a zone
- A Discord application with a bot ([discord.com/developers/applications](https://discord.com/developers/applications))

### 1. Clone and install

```bash
git clone https://github.com/Psalm2517/Cinderbox.git
cd Cinderbox
npm install
```

### 2. Create the D1 database

```bash
npx wrangler d1 create cinderbox
```

Copy `wrangler.toml.example` to `wrangler.toml` and fill in the `database_id` it printed, plus your `DISPOSABLE_DOMAIN`. `wrangler.toml` is gitignored — your account-specific values never get committed.

```bash
npm run db:init
```

### 3. Point your domain at Cloudflare Email Routing

**This is the step most likely to trip you up.** If your domain already has MX records (another mail host, Google Workspace, etc.), enabling Email Routing in the Cloudflare dashboard does not necessarily overwrite them for you. Check what your MX records actually resolve to:

```bash
nslookup -type=MX yourdomain.com 1.1.1.1
```

They need to be Cloudflare's own routing servers — `route1.mx.cloudflare.net`, `route2.mx.cloudflare.net`, `route3.mx.cloudflare.net`. If they're not, mail will never reach the Worker no matter how correctly everything else is set up, and it fails *silently* — no error, the email just goes wherever the old MX was pointing.

### 4. Deploy and wire up the catch-all

```bash
npm run deploy
```

Then, in the Cloudflare dashboard (**Email > Email Routing**) or via the API, add a catch-all rule whose action is this Worker (`cinderbox`) — not "forward to email."

### 5. Discord app secrets and commands

From your Discord application's settings, grab the bot token, public key, and application ID, then:

```bash
npx wrangler secret put DISCORD_TOKEN
npx wrangler secret put DISCORD_PUBLIC_KEY
npx wrangler secret put DISCORD_APPLICATION_ID
```

With `DISCORD_TOKEN` and `DISCORD_APPLICATION_ID` set in your environment, register the slash commands:

```bash
npm run register-commands
```

Then set the application's **Interactions Endpoint URL** (General Information tab) to:

```
https://<your-worker>.<your-subdomain>.workers.dev/interactions
```

Discord verifies this by sending a signed ping — if it fails, double-check the deployed `DISCORD_PUBLIC_KEY` secret matches the app's Verify Key exactly.

The bot works installed to a server or installed to just your own account (DM-only) — both are enabled by default in `register-commands.ts`.

## Configuration

| Variable | Where | Description |
|---|---|---|
| `DISPOSABLE_DOMAIN` | `wrangler.toml` `[vars]` | Domain addresses are generated on. |
| `ADAPTERS` | `wrangler.toml` `[vars]` | Comma-separated enabled adapters. Currently just `discord`. |
| `DISCORD_TOKEN` | secret | Bot token. |
| `DISCORD_PUBLIC_KEY` | secret | Used to verify interaction signatures. |
| `DISCORD_APPLICATION_ID` | secret | Used by `register-commands.ts`. |

## Architecture

```
src/core/       Adapter-agnostic engine — address CRUD, rate limiting, dispatch, email parsing
src/adapters/   Pluggable delivery adapters (discord/ ships built-in)
src/worker.ts   Wires enabled adapters into core; fetch/email/scheduled entrypoints
```

## Adding an adapter

`src/core` never imports from `src/adapters` — the only file that knows both exist is `src/worker.ts`, which wires enabled adapters into `core/dispatch.ts` keyed by `OwnerRef.type`. To add one:

1. Implement `MailAdapter` (`src/core/types.ts`): a `name` and a `deliver(owner, mail)` that returns `{ success, error? }` and never throws.
2. Register it in `buildAdapters()` in `src/worker.ts`, gated on `ADAPTERS`.

That's the whole contract — the core doesn't need to know anything else about your adapter.

## Limits

- 5 active addresses per user, 7-day expiry (resets on `/extend`)
- Discord DM body: 1500 characters inline; longer bodies get attached as `message.txt`
- Inbound HTML is capped at 256KB before parsing — email parsing scales quadratically with input size, and addresses are reachable by anyone who learns one, so this bounds worst-case CPU rather than rejecting large mail outright
- Attachments forward individually up to a combined 25MB per email; anything over budget is dropped with a note instead of discarding the whole batch

## License

MIT. See [LICENSE](./LICENSE).
