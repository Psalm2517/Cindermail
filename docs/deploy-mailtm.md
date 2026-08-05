# Using mail.tm instead of your own domain

This is the low-setup option: no domain, no DNS, no server that needs to receive inbound mail. Addresses live on mail.tm's own domain instead of one you own. Discord setup is still a separate step in [discord-adapter.md](discord-adapter.md), same as every other path.

Read this before picking it: addresses on mail.tm's domain are recognizable as a public disposable-mail service, and a meaningful number of signup forms specifically detect and block known temp-mail domains including mail.tm. A chunk of the reason to run your own domain in the first place is that it doesn't look disposable to anything. This path trades that away for zero setup. If a given site rejects the address, that's what's happening, not a bug here.

## What you need

- Node.js 18 or newer, or Docker.
- A Discord application with a bot.
- Nothing else. No domain, no DNS, no port 25.

You do still need one thing every other path also needs: a public HTTPS URL for Discord's interactions webhook. See step 3 below, it's the same requirement as the self-hosted path for the same reason.

`npm run setup` does steps 1 through 3 below interactively if you'd rather not do them by hand. The rest of this guide is what it's doing on your behalf, and what to do once it's finished.

## 1. Clone and install

```bash
git clone https://github.com/Psalm2517/Cindermail.git
cd Cindermail
npm install
```

## 2. Configure

```bash
cp .env.example .env
```

Fill in the three `DISCORD_*` fields (see [discord-adapter.md](discord-adapter.md) for where to get them). Leave `DISPOSABLE_DOMAIN` out entirely, this mode doesn't use it. See [configuration.md](configuration.md) for the rest.

## 3. Run

```bash
npm run start:mailtm
```

This creates a local SQLite file (same as the self-hosted path) and starts polling mail.tm every 15 seconds by default (`MAILTM_POLL_INTERVAL_SECONDS`). No SMTP server, no inbound port at all, since mail.tm handles receiving on their infrastructure and this just checks in periodically.

You should see:

```
Cindermail (mail.tm mode) starting. storage: ./cinderbox.db
Interactions HTTP server listening on :8787 (POST /interactions)
```

## 4. Get the webhook onto HTTPS

Same requirement, same reasoning as the self-hosted path: the bundled HTTP server is plain HTTP, Discord needs HTTPS. Put a reverse proxy (Caddy, nginx) or a tunnel (Cloudflare Tunnel, ngrok) in front of `HTTP_PORT`. See [deploy-selfhost.md](deploy-selfhost.md#5-get-the-webhook-onto-https) for the same section written out in more detail, it applies here unchanged.

Then finish the rest of [discord-adapter.md](discord-adapter.md): register the commands, point Discord's Interactions Endpoint URL at your HTTPS URL, done.

## How addresses work here

`/new` calls mail.tm's API to actually provision a mailbox on their side (not just generate a name on a domain you own), and stores the password needed to poll it. `/torch` and expiry both trigger deleting the account on mail.tm's side too during the daily cleanup, not just the local row, so nothing lingers on their servers past its grace period.

## Running with Docker

The same `Dockerfile` works, just override the command and drop the SMTP port mapping since nothing listens on it in this mode:

```bash
docker build -t cinderbox .
docker run -d \
  --name cinderbox-mailtm \
  --restart unless-stopped \
  --env-file .env \
  -p 8787:8787 \
  -v cinderbox-data:/data \
  cinderbox \
  node --experimental-strip-types src/receivers/mailtm/run.ts
```
