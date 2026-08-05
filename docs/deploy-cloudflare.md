# Deploying on Cloudflare Workers

This covers getting mail received and stored. It has nothing to do with Discord, that's a separate step in [discord-adapter.md](discord-adapter.md) you'll do once this part is working, regardless of which hosting path you picked.

This path needs a domain you own. If you'd rather not deal with one, [deploy-mailtm.md](deploy-mailtm.md) needs no domain, DNS, or server. `npm run setup` handles the `wrangler.jsonc` and D1 parts of steps 1 and 2 below for you if you do want this path.

There's also a [Deploy to Cloudflare button](../README.md#deploy-to-cloudflare) if you'd rather skip the local clone. It forks the repo, creates a new (empty) D1 database, deploys the Worker, and prompts for the three Discord secrets — that's all it does. You still need to do everything below except the `wrangler d1 create` command in step 2 (the button already made you a database, don't make a second one): run `npm run cf:db:init` to actually load the schema into it, set your own `DISPOSABLE_DOMAIN` in `wrangler.jsonc` instead of the one it deployed with, point your domain at Email Routing (step 3), and register the Discord commands ([discord-adapter.md](discord-adapter.md)). None of those are optional just because you used the button.

## What you need

- Node.js 18 or newer, just for running these commands locally. Nothing runs on your own machine once deployed.
- A Cloudflare account, with the domain you want to use already added as a zone.

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

Open `wrangler.jsonc` and fill in the `database_id` that command just printed, plus your own `DISPOSABLE_DOMAIN`. `npm run setup` does both for you if you'd rather not edit it by hand.

`wrangler.jsonc` is committed rather than gitignored: Cloudflare Workers Builds clones this repo and needs the D1 binding present at build time, and bindings set only in the dashboard don't reliably survive into new versions. Nothing secret goes in it, the database id and domain are identifiers rather than credentials, and Discord's tokens stay in `wrangler secret put`. Note that it takes precedence over a `wrangler.toml` silently, so if you create one of those instead it will be ignored.

```bash
npm run cf:db:init
```

## 3. Point your domain at Cloudflare Email Routing

This is the step most likely to trip you up, so read this part carefully. If your domain already has MX records (another mail host, Google Workspace, whatever), turning on Email Routing in the Cloudflare dashboard does not automatically overwrite them for you. Check what your MX records actually resolve to before assuming anything:

```bash
nslookup -type=MX yourdomain.com 1.1.1.1
```

They need to be Cloudflare's own routing servers: `route1.mx.cloudflare.net`, `route2.mx.cloudflare.net`, `route3.mx.cloudflare.net`. If they're not, mail will never reach the Worker, no matter how correctly you've set up everything else, and it fails silently. No error, no bounce. The email just goes wherever the old MX record was already pointing.

## 4. Deploy and wire up the catch-all

```bash
npm run cf:deploy
```

Then in the Cloudflare dashboard, under Email > Email Routing, add a catch-all rule whose action is this Worker. Look for the option to route to a Worker, not "forward to email."

## 5. Set up mail delivery

Mail is now being received and stored. It won't go anywhere yet, because nothing is set up to deliver it. That's the Discord adapter setup, and it's the same regardless of Cloudflare vs self-hosting, so it lives in its own guide: [discord-adapter.md](discord-adapter.md).

## The status page

This path (and only this path) also serves a small public page at the Worker's root showing running totals: addresses created, emails received, addresses torched. `GET /counters` returns the same numbers as JSON if you want them elsewhere. Nothing per-user or per-address is exposed, just three totals.

To reach it on your own domain rather than the `workers.dev` URL, add a Custom Domain under the Worker's Settings > Domains & Routes. That's separate from the Email Routing rule above, which only handles inbound mail.

The totals come from a `counters` table rather than counting rows, since daily cleanup deletes expired and torched rows and a live count would shrink as it ran. If the table isn't there the counters read as zero and nothing else breaks, so an existing deployment that hasn't applied the migrations below still hands out addresses and delivers mail normally.

## Upgrading an existing deployment

Fresh installs get everything from `schema.sql` and need none of this. A database created before a given feature existed needs that feature's migration applied once:

```bash
npx wrangler d1 execute cinderbox --remote --file=migrations/0003_add_permanent.sql
npx wrangler d1 execute cinderbox --remote --file=migrations/0004_add_counters.sql
npx wrangler d1 execute cinderbox --remote --file=migrations/0005_add_received_counter.sql
```

`0003` is what `/new permanent:` and `/extend permanent:` need, `0004` and `0005` are the status page's totals. Self-hosted and mail.tm deployments apply the same files against their SQLite database instead.
