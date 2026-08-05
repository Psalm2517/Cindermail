# Deploying on Cloudflare Workers

This covers getting mail received and stored. It has nothing to do with Discord, that's a separate step in [discord-adapter.md](discord-adapter.md) you'll do once this part is working, regardless of which hosting path you picked.

This path needs a domain you own. If you'd rather not deal with one, [deploy-mailtm.md](deploy-mailtm.md) needs no domain, DNS, or server. `npm run setup` handles the `wrangler.toml` and D1 parts of steps 1 and 2 below for you if you do want this path.

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

Copy `wrangler.toml.example` to `wrangler.toml`. Fill in the `database_id` that command just printed, plus your `DISPOSABLE_DOMAIN`. `wrangler.toml` is gitignored, so none of your account specific values ever get committed.

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
