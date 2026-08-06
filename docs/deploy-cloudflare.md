# Deploying on Cloudflare Workers

Nothing runs on your own machine once this is deployed. One Worker, one D1 database, two modes:

- **Your own domain.** Mail arrives through Cloudflare Email Routing. Needs a domain added to your Cloudflare account as a zone.
- **mail.tm mode.** No domain, no DNS, nothing to buy. Addresses are provisioned on mail.tm's domain and their API is polled instead.

Same Worker, same guide, same commands. The `DISPOSABLE_DOMAIN` setting is the only difference: set it for the first mode, leave it empty for the second. You can switch later by changing that one variable.

If you want mail.tm mode, read [the caveat](#mailtm-mode-no-domain) below before starting.

Discord setup is a separate step you'll do at the end, same for every path: [discord-adapter.md](discord-adapter.md).

`npm run setup` handles steps 1 and 2 interactively if you'd rather not edit config by hand. There's also a [Deploy to Cloudflare button](../README.md#deploy) that replaces steps 1, 2 and 5, but leaves the rest of this guide to you.

## What you need

- Node.js 18 or newer, just for running these commands locally.
- A Cloudflare account.
- A domain added to that account as a zone. **Only for domain mode**, mail.tm mode needs no domain at all.

## 1. Clone and install

```bash
git clone https://github.com/Psalm2517/Cindermail.git
cd Cindermail
npm install
```

## 2. Create the database and pick your mode

```bash
npx wrangler d1 create cinderbox
```

Open `wrangler.jsonc` and fill in the `database_id` that command just printed. Then set your mode in the same file, under `vars`:

- **Domain mode:** set `DISPOSABLE_DOMAIN` to a domain you own.
- **mail.tm mode:** delete the `DISPOSABLE_DOMAIN` line entirely (or set it to `""`).

Leave the cron triggers alone in both cases. The frequent one is the mail.tm poll, and it exits immediately without doing anything in domain mode.

Then load the schema:

```bash
npm run cf:db:init
```

<details>
<summary>Why <code>wrangler.jsonc</code> is committed instead of gitignored</summary>

Cloudflare Workers Builds clones this repo and needs the D1 binding present at build time, and bindings set only in the dashboard don't reliably survive into new versions. Nothing secret goes in it: the database id and domain are identifiers, not credentials, and Discord's tokens stay in `wrangler secret put`. Note it silently takes precedence over a `wrangler.toml`, so creating one of those instead has no effect.
</details>

## 3. Point your domain at Email Routing

**Skip this entire step in mail.tm mode.** There's no domain to point anywhere.

This is the step most likely to trip you up, so read carefully. If your domain already has MX records (another mail host, Google Workspace, whatever), turning on Email Routing in the Cloudflare dashboard does not automatically overwrite them for you. Check what your MX records actually resolve to before assuming anything:

```bash
nslookup -type=MX yourdomain.com 1.1.1.1
```

They need to be Cloudflare's own routing servers: `route1.mx.cloudflare.net`, `route2.mx.cloudflare.net`, `route3.mx.cloudflare.net`. If they're not, mail will never reach the Worker no matter how correctly everything else is set up, and it fails silently. No error, no bounce. The email just goes wherever the old MX record was already pointing.

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

**Domain mode only:** afterward, in the Cloudflare dashboard under Email > Email Routing, add a catch-all rule whose action is this Worker. Look for the option to route to a Worker, not "forward to email."

## 6. Set up mail delivery

Mail is now being received and stored, but it won't go anywhere yet. That's the Discord adapter: [discord-adapter.md](discord-adapter.md). Use your Worker's URL plus `/interactions` as the Interactions Endpoint URL.

## mail.tm mode, no domain

Worth knowing before you pick it:

**Some sites block it.** Addresses live on mail.tm's own domain, which is a recognizable public disposable-mail service. A meaningful number of signup forms detect and block known temp-mail domains including mail.tm. A big part of the reason to run your own domain is that it doesn't look disposable to anything. If a site rejects the address, that's what's happening, not a bug here.

**Mail arrives a bit slower.** Cron triggers have a one minute floor, so new mail shows up in about 30 seconds on average, 60 at worst. It's polling, not instant delivery.

**Addresses are real mailboxes on mail.tm.** `/new` calls their API to actually provision one and stores the password needed to poll it. `/torch` and expiry delete the account on their side too during cleanup, so nothing lingers on their servers.

Everything else is identical to domain mode, including the status page below.

## The status page

The Worker serves a small public page at its root showing addresses created, emails received, addresses torched, and how many people currently hold an active address. `GET /counters` returns the same numbers as JSON. No addresses, notes, or owner ids are exposed, just the totals. Works in both modes.

To serve it on your own domain rather than the `workers.dev` URL, add a Custom Domain under the Worker's Settings > Domains & Routes. That's separate from Email Routing, which only handles inbound mail.

The first three come from a `counters` table rather than counting rows, since daily cleanup deletes expired and torched rows and a live count would shrink as it ran. The user count is deliberately live instead: it's people with an address right now, not people who ever had one, so it does go down. If the table isn't there the counters read as zero and nothing else breaks.

## Upgrading an existing deployment

Fresh installs get everything from `schema.sql` and need none of this. A database created before a given feature existed needs that feature's migration applied once:

```bash
npx wrangler d1 execute cinderbox --remote --file=migrations/0003_add_permanent.sql
npx wrangler d1 execute cinderbox --remote --file=migrations/0004_add_counters.sql
npx wrangler d1 execute cinderbox --remote --file=migrations/0005_add_received_counter.sql
npx wrangler d1 execute cinderbox --remote --file=migrations/0006_add_note.sql
npx wrangler d1 execute cinderbox --remote --file=migrations/0007_add_expiry_reminders.sql
```

`0003` is what permanent addresses need, `0004` and `0005` are the status page's totals, `0006` is address notes, `0007` is opt-in expiry reminders. Re-run `npm run register-commands` afterward so Discord picks up any new command options.
