# mail.tm on Cloudflare Workers

This is the no-domain, no-server-to-babysit option: mail.tm receives mail on its own infrastructure the same as the [Node-based mail.tm path](deploy-mailtm.md), but instead of running a persistent Node process yourself, a Cloudflare Worker polls mail.tm on a cron trigger. No domain, no DNS, no Email Routing, no machine to keep alive, and unlike the Node path you don't need a reverse proxy or tunnel for HTTPS either, Workers already serve HTTPS.

It's the same Worker and the same [wrangler.jsonc](../wrangler.jsonc) as [deploy-cloudflare.md](deploy-cloudflare.md), just with `DISPOSABLE_DOMAIN` left unset. That one variable is the entire difference: set it and mail arrives through Email Routing on a domain you own, clear it and addresses get provisioned on mail.tm's domain and polled instead.

Read the mail.tm caveat in [deploy-mailtm.md](deploy-mailtm.md) first if you haven't: addresses live on mail.tm's own domain, which some signup forms recognize and block as a known disposable-mail domain.

One real tradeoff versus the Node path: cron triggers have a 1 minute floor, so this polls less often than the Node path's 15 second default. Average wait for a new email goes from about 7.5 seconds to about 30 seconds, worst case from 15 seconds to 60. If that matters more than not running a server, use [deploy-mailtm.md](deploy-mailtm.md) instead.

## What you need

- Node.js 18 or newer, just for running these commands locally. Nothing runs on your own machine once deployed.
- A Cloudflare account. No domain needed, no zone to add.

The [Deploy to Cloudflare button](../README.md#deploy-to-cloudflare) works for this mode too. It deploys with this repo's committed `DISPOSABLE_DOMAIN`, so clear that variable in the dashboard afterward (step 3 below) to switch it into mail.tm mode.

## 1. Clone and install

```bash
git clone https://github.com/Psalm2517/Cindermail.git
cd Cindermail
npm install
```

## 2. Create the D1 database

```bash
npx wrangler d1 create cinderbox
```

Open `wrangler.jsonc` and fill in the `database_id` that command just printed.

```bash
npm run cf:db:init
```

## 3. Clear DISPOSABLE_DOMAIN

In `wrangler.jsonc`, delete the `DISPOSABLE_DOMAIN` line from `vars` (or set it to an empty string). That's what puts the Worker in mail.tm mode. Leave the two cron triggers alone, the frequent one is the mail.tm poll.

If you already deployed and want to switch an existing Worker over, you can clear the same variable in the dashboard under the Worker's Settings instead, no redeploy needed.

## 4. Set the Discord secrets

```bash
npx wrangler secret put DISCORD_TOKEN
npx wrangler secret put DISCORD_PUBLIC_KEY
npx wrangler secret put DISCORD_APPLICATION_ID
```

Where to find these: [discord-adapter.md](discord-adapter.md).

## 5. Deploy

```bash
npm run cf:deploy
```

Both cron schedules register automatically: the frequent one polls mail.tm, the daily one runs cleanup (expired and torched addresses, stale rate-limit rows, and deleting the mailbox on mail.tm's side too, same as the Node path).

## 6. Set up mail delivery

Mail is now being polled and stored. It won't go anywhere yet, that's the Discord adapter setup, same regardless of which hosting path you picked: [discord-adapter.md](discord-adapter.md). Use this Worker's `workers.dev` URL (shown after `cf:deploy` finishes) plus `/interactions` as the Interactions Endpoint URL, no custom domain needed.

## How addresses work here

Same as the Node path: `/new` calls mail.tm's API to provision a mailbox on their side and stores the password needed to poll it. `/torch` and expiry both delete the account on mail.tm's side too during cleanup, not just the local row.

## What you don't get

Everything in [deploy-cloudflare.md](deploy-cloudflare.md) applies except the parts that need a domain: no Email Routing setup, no MX records, no catch-all rule, no custom domain for the status page (it's still there on the `workers.dev` URL). The status page's counters work the same in both modes.
