<div align="center">

# Cinderbox

**A disposable-email service you run yourself: give out addresses on your own domain, get the mail delivered somewhere you actually check.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org)

</div>

---

Give out `x7k2p9qzrm@yourdomain.com` instead of your real address. Anything sent to it gets parsed, cleaned up, and delivered — no inbox to check, no account to log into. When you're done with it, torch it.

The core is a small, self-contained mail-routing engine: it owns address creation/expiry, rate limiting, and MIME parsing, and knows nothing about *where* mail ends up or *how* it's received. Two pluggable boundaries hang off that core:

- **Delivery adapters** decide where parsed mail goes. Discord (DM) is the one that ships. `src/core` never imports `src/adapters` — see [Adding a delivery adapter](#adding-a-delivery-adapter).
- **Storage/receiver backends** decide how mail arrives and where address state lives. Two ship today: **Cloudflare** (Email Routing + D1, zero infrastructure to run yourself) and **self-hosted** (a plain SMTP server + SQLite, runs anywhere Node runs). Same schema, same business logic, same SQL, either way — see [Architecture](#architecture).

Nothing about Cinderbox requires Cloudflare specifically. A domain is unavoidable either way — that's inherent to how mail routing works, not a Cinderbox or Cloudflare constraint — but which infrastructure receives that domain's mail is up to you.

## Commands

All replies are ephemeral (only you see them). Every limit below is a default, not a constant — see [Configuration](#configuration).

| Command | Description | Default rate limit |
|---|---|---|
| `/new` | Create a disposable address. Max 5 active at once. | 1 / 30s |
| `/list` | List your active addresses and when they expire. | 15 / 60s |
| `/extend <address>` | Push expiry out another 7 days. | 15 / 60s |
| `/torch <address>` | Revoke an address immediately. | 15 / 60s |

Addresses expire 7 days after creation (or after the last `/extend`) whether you torch them or not.

## How it works

1. `/new` generates a random 10-character local part and stores `address -> owner` in the database.
2. You hand that address out somewhere.
3. Mail arrives at your domain's catch-all. The receiver (Cloudflare Email Routing, or your own SMTP server) hands it to the core, which looks up the owner and drops it silently if the address is missing, expired, or torched — no bounce, no logging of content.
4. The parsed mail (HTML converted to readable text, links preserved, attachments forwarded) goes out through whichever delivery adapter is enabled.

A daily cleanup sweeps expired/torched addresses (24h grace period) and stale rate-limit rows, on both deployment paths.

## Choosing a deployment path

| | Cloudflare Workers | Self-hosted (Node/Docker) |
|---|---|---|
| Infrastructure to run | None — Workers, D1, and Email Routing are all free at this project's scale | A machine you control (VPS, home server, etc.) |
| Where mail is received | Cloudflare's edge | Your own SMTP server, on your own box |
| Storage | D1 | SQLite (a single file) |
| Your domain's MX points at | `route1/2/3.mx.cloudflare.net` | Your machine's own IP |
| Setup effort | Lower — no server to keep running | Higher — you own uptime, TLS for the webhook, and (usually) port 25 |
| Data location | Cloudflare's infrastructure | Wherever you run it |

Neither path is "the real one" — pick whichever tradeoff fits. The core logic, schema, and commands are identical either way.

---

## Deploy on Cloudflare Workers

### Requirements

- Node.js 18+ (for local tooling only — nothing runs on your machine in production)
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
npm run cf:db:init
```

### 3. Point your domain at Cloudflare Email Routing

**This is the step most likely to trip you up.** If your domain already has MX records (another mail host, Google Workspace, etc.), enabling Email Routing in the Cloudflare dashboard does not necessarily overwrite them for you. Check what your MX records actually resolve to:

```bash
nslookup -type=MX yourdomain.com 1.1.1.1
```

They need to be Cloudflare's own routing servers — `route1.mx.cloudflare.net`, `route2.mx.cloudflare.net`, `route3.mx.cloudflare.net`. If they're not, mail will never reach the Worker no matter how correctly everything else is set up, and it fails *silently* — no error, the email just goes wherever the old MX was pointing.

### 4. Deploy and wire up the catch-all

```bash
npm run cf:deploy
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

---

## Self-host on your own server

Runs as a plain Node process (or in Docker) with no Cloudflare account at all. Your machine receives inbound SMTP directly and stores state in a local SQLite file.

### Requirements

- Node.js 18+ (or Docker)
- A machine with a public IP that can receive inbound traffic on port 25 (a VPS, a home server with port forwarding, etc.)
- A domain you control DNS for
- A Discord application with a bot

One honest caveat: some cloud/VPS providers restrict port 25 by default (usually *outbound*, as an anti-spam measure — this doesn't affect receiving — but a few also restrict inbound or require you to request it be opened). Check with your provider if mail isn't arriving.

### 1. Clone and install

```bash
git clone https://github.com/Psalm2517/Cinderbox.git
cd Cinderbox
npm install
```

### 2. Point your domain at your own server

This is a genuinely different DNS setup from the Cloudflare path: create an A (or AAAA) record for a hostname pointing at your server's public IP, then an MX record for your domain pointing at that hostname. For example, if your server's IP is `203.0.113.10`:

```
mail.yourdomain.com.   A      203.0.113.10
yourdomain.com.        MX 10  mail.yourdomain.com.
```

Verify it resolves correctly (and give DNS a few minutes to propagate) before moving on:

```bash
nslookup -type=MX yourdomain.com
```

### 3. Configure

```bash
cp .env.example .env
```

Fill in `DISPOSABLE_DOMAIN` and the three `DISCORD_*` values from your Discord application's settings. See [Configuration](#configuration) for every variable and its default.

### 4. Run

```bash
npm start
```

On first run this creates `cinderbox.db` (or wherever `SQLITE_PATH` points) and applies the schema automatically — no separate init step. You should see:

```
Cinderbox starting — domain: yourdomain.com, storage: ./cinderbox.db
Interactions HTTP server listening on :8787 (POST /interactions)
SMTP server listening on 0.0.0.0:25
```

Keep it running with a process supervisor (`systemd`, `pm2`, Docker's own restart policy) rather than a bare terminal.

### 5. Expose the interactions webhook over HTTPS

Discord requires the **Interactions Endpoint URL** to be HTTPS. The bundled HTTP server on `HTTP_PORT` is plain HTTP — put a reverse proxy in front of it (Caddy, nginx, or a tunnel like Cloudflare Tunnel or ngrok) to get a real TLS certificate, then point Discord at that HTTPS URL's `/interactions` path. (Using Cloudflare Tunnel here doesn't require an Email Routing setup or a D1 database — it's just acting as a reverse proxy, so it doesn't reintroduce the Cloudflare dependency the self-hosted path is meant to avoid.)

With `DISCORD_TOKEN` and `DISCORD_APPLICATION_ID` set, register the slash commands the same way as the Cloudflare path:

```bash
npm run register-commands
```

### Running with Docker

```bash
docker build -t cinderbox .
docker run -d \
  --name cinderbox \
  --restart unless-stopped \
  --env-file .env \
  -p 25:2525 \
  -p 8787:8787 \
  -v cinderbox-data:/data \
  cinderbox
```

The image runs as a non-root user and listens on unprivileged port `2525` internally by default — `-p 25:2525` maps the real port 25 to it, so the container never needs elevated privileges. `SQLITE_PATH` defaults to `/data/cinderbox.db` inside the image; the named volume keeps it across container recreation.

---

## Configuration

Cloudflare deployments set these in `wrangler.toml` `[vars]` (non-secret) or via `wrangler secret put` (secret). Self-hosted deployments set all of them in `.env`.

| Variable | Secret? | Default | Description |
|---|---|---|---|
| `DISPOSABLE_DOMAIN` | no | — (required) | Domain addresses are generated on. |
| `ADAPTERS` | no | `discord` | Comma-separated enabled delivery adapters. |
| `DISCORD_TOKEN` | yes | — (required) | Bot token. |
| `DISCORD_PUBLIC_KEY` | yes | — (required) | Used to verify interaction signatures. |
| `DISCORD_APPLICATION_ID` | yes | — (required) | Used by `register-commands.ts`. |
| `MAX_ACTIVE_ADDRESSES` | no | `5` | Addresses a single owner can have active at once. |
| `ADDRESS_TTL_SECONDS` | no | `604800` (7 days) | How long a new or extended address lives. |
| `RATE_LIMIT_<CMD>_WINDOW_SECONDS` | no | see table below | Window for a given command's rate limit. `<CMD>` is `NEW`, `LIST`, `EXTEND`, or `TORCH`. |
| `RATE_LIMIT_<CMD>_MAX` | no | see table below | Max calls per window. **Set to `0` to disable rate limiting for that command entirely.** |

Rate limit defaults: `NEW` is 30s / 1, `LIST`/`EXTEND`/`TORCH` are each 60s / 15. These exist to bound abuse on a deployment other people can reach — they're not safety rails Cinderbox needs to enforce on you. If you're self-hosting for yourself alone, note that limits are already scoped per owner, not shared globally, so in practice they don't get in the way of solo use even at the defaults; there's usually nothing to tune. If you *do* want them gone, set every `RATE_LIMIT_*_MAX` to `0`.

Self-hosted-only variables (no Cloudflare equivalent — see `.env.example`):

| Variable | Default | Description |
|---|---|---|
| `SMTP_PORT` | `25` | Port the SMTP server listens on for inbound mail. |
| `SMTP_HOST` | `0.0.0.0` | Interface the SMTP server binds to. |
| `HTTP_PORT` | `8787` | Port the interactions HTTP server listens on (put a reverse proxy in front for HTTPS). |
| `SQLITE_PATH` | `./cinderbox.db` | Where the SQLite database file lives. Created automatically. |

## Architecture

```
src/core/            Deployment-agnostic engine: address CRUD, rate limiting,
                      dispatch, MIME parsing. Imports nothing from adapters/
                      or storage/ — only ever talks to the SqlExecutor and
                      MailAdapter interfaces defined in core/.
src/core/storage.ts   SqlExecutor: the minimal (run/first/all) interface core
                      runs SQL against. D1 and SQLite both speak SQLite
                      dialect, so schema.sql and every query in core/db.ts
                      and core/ratelimit.ts are shared verbatim between them.
src/storage/          Implementations of SqlExecutor: d1.ts (Cloudflare),
                      sqlite.ts (self-hosted, via better-sqlite3).
src/adapters/         Pluggable delivery adapters (discord/ ships built-in).
src/worker.ts         Cloudflare entrypoint: fetch/email/scheduled, wires a
                      D1Executor and enabled adapters into core.
src/node/             Self-hosted entrypoint: an SMTP server (inbound mail),
                      a plain HTTP server (Discord interactions), and a
                      setInterval-based cleanup schedule, wired against a
                      SqliteExecutor instead of D1.
```

## Adding a delivery adapter

`src/core` never imports from `src/adapters` — the only files that know both exist are `src/worker.ts` and `src/node/index.ts`, which each wire enabled adapters into `core/dispatch.ts` keyed by `OwnerRef.type`. To add one:

1. Implement `MailAdapter` (`src/core/types.ts`): a `name` and a `deliver(owner, mail)` that returns `{ success, error? }` and never throws.
2. Register it in `buildAdapters()` in both entrypoints, gated on `ADAPTERS`.

That's the whole contract — the core doesn't need to know anything else about your adapter.

## Adding a storage/receiver backend

Implement `SqlExecutor` (`src/core/storage.ts`) against whatever SQL engine you want — it only needs `run`/`first`/`all`, and `schema.sql` already works against anything SQLite-dialect-compatible. Pair it with a receiver that calls `core/email.ts`'s `handleInboundEmail({ to, from, raw }, db, dispatcher)` for each piece of inbound mail; `raw` accepts anything `postal-mime` does (a `Buffer`, a `ReadableStream`, a `string`, ...), which covers most real-world receiving mechanisms without any extra glue.

## Limits

- 5 active addresses per owner by default, 7-day expiry (both configurable — see [Configuration](#configuration))
- Discord DM body: 1500 characters inline; longer bodies get attached as `message.txt`
- Inbound HTML is capped at 256KB before parsing — email parsing scales quadratically with input size, and addresses are reachable by anyone who learns one, so this bounds worst-case CPU rather than rejecting large mail outright
- Attachments forward individually up to a combined 25MB per email; anything over budget is dropped with a note instead of discarding the whole batch

## License

MIT. See [LICENSE](./LICENSE).
