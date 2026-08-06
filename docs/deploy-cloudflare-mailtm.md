# mail.tm on Cloudflare Workers

This is the no-domain, no-server-to-babysit option: mail.tm receives mail on its own infrastructure the same as the [Node-based mail.tm path](deploy-mailtm.md), but instead of running a persistent Node process yourself, a Cloudflare Worker polls mail.tm on a Cron Trigger. No domain, no DNS, no Email Routing, no machine to keep alive, and unlike the Node path you don't need to put anything in front of it for HTTPS either, Workers already serve HTTPS.

Read the mail.tm caveat in [deploy-mailtm.md](deploy-mailtm.md) first if you haven't: addresses live on mail.tm's own domain, which some signup forms recognize and block as a known disposable-mail domain.

One real tradeoff versus the Node path: Cron Triggers have a 1 minute floor, so this polls less often than the Node path's 15 second default. Average wait for a new email goes from about 7.5 seconds to about 30 seconds, worst case from 15 seconds to 60. If that matters more than not running a server, use [deploy-mailtm.md](deploy-mailtm.md) instead.

## What you need

- Node.js 18 or newer, just for running these commands locally. Nothing runs on your own machine once deployed.
- A Cloudflare account. No domain needed, no zone to add.

There's also a [Deploy to Cloudflare button](../README.md#deploy-to-cloudflare) if you'd rather skip the local clone. Same caveats as the other button: it provisions its own D1 database (empty, `schema.sql` doesn't run automatically) and prompts for the Discord secrets, but everything below except `wrangler d1 create` is still required afterward.

## 1. Clone and install

```bash
git clone https://github.com/Psalm2517/Cindermail.git
cd Cindermail
npm install
```

## 2. Create the D1 database

```bash
npx wrangler d1 create cinderbox-mailtm
```

Copy `wrangler-mailtm.jsonc.example` to `wrangler-mailtm.jsonc` and fill in the `database_id` that command just printed. Unlike the domain-based path's `wrangler.jsonc`, this one is gitignored: it's meant for a manual `wrangler deploy` from your own machine, not Workers Builds' git-triggered auto-deploy, so there's no reason to commit it.

```bash
npm run cf:mailtm:db:init
```

## 3. Set the Discord secrets

```bash
npx wrangler secret put DISCORD_TOKEN --config wrangler-mailtm.jsonc
npx wrangler secret put DISCORD_PUBLIC_KEY --config wrangler-mailtm.jsonc
npx wrangler secret put DISCORD_APPLICATION_ID --config wrangler-mailtm.jsonc
```

Where to find these: [discord-adapter.md](discord-adapter.md).

## 4. Deploy

```bash
npm run cf:mailtm:deploy
```

This registers both cron schedules from `wrangler-mailtm.jsonc` automatically: the frequent one polls mail.tm, the daily one runs cleanup (expired/torched addresses, stale rate-limit rows, and deleting the mailbox on mail.tm's side too, same as the Node path).

## 5. Set up mail delivery

Mail is now being polled and stored. It won't go anywhere yet, that's the Discord adapter setup, same regardless of which hosting path you picked: [discord-adapter.md](discord-adapter.md). Use this Worker's `workers.dev` URL (shown after `cf:mailtm:deploy` finishes) plus `/interactions` as the Interactions Endpoint URL, no custom domain needed.

## How addresses work here

Same as the Node path: `/new` calls mail.tm's API to provision a mailbox on their side and stores the password needed to poll it. `/torch` and expiry both delete the account on mail.tm's side too during cleanup, not just the local row.

## Upgrading an existing deployment

Same migrations as the domain-based path, run against this Worker's own database instead:

```bash
npx wrangler d1 execute cinderbox-mailtm --remote --file=migrations/0003_add_permanent.sql --config wrangler-mailtm.jsonc
```

`0003` is what `/new permanent:` and `/extend permanent:` need. This path has no status page (`0004`/`0005` are Cloudflare-domain-only for now), so there's nothing else to apply.
