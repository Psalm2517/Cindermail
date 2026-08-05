# Self-hosting on your own server

This covers getting mail received and stored on a machine you control, with no Cloudflare account involved at all. Discord setup is a separate step in [discord-adapter.md](discord-adapter.md), same as the Cloudflare path, do that once this part's working.

This path needs a domain you own and a machine that can receive on port 25. If you'd rather not deal with either, [deploy-mailtm.md](deploy-mailtm.md) needs neither. `npm run setup` handles the `.env` parts of steps 1 and 3 below for you if you do want this path.

## What you need

- Node.js 18 or newer, or Docker.
- A machine with a public IP that can receive inbound traffic on port 25. A VPS is the usual choice. A home server works too if your ISP and router allow inbound port 25, which some don't.
- A domain you control DNS for.

One honest caveat before you start: some cloud and VPS providers restrict port 25 by default. Usually this is *outbound* only, meant to stop spam from getting sent, and it doesn't affect receiving mail at all. A few providers also restrict inbound 25 or make you request it be opened. If mail isn't showing up later and everything else looks right, this is the first thing to check with your provider.

## 1. Clone and install

```bash
git clone https://github.com/Psalm2517/Cindermail.git
cd Cindermail
npm install
```

## 2. Point your domain at your own server

This is genuinely different from the Cloudflare path, not just a different value in the same field. You need an A (or AAAA) record for a hostname pointing at your server's public IP, then an MX record for your domain pointing at that hostname. If your server's IP is `203.0.113.10`, that looks like:

```
mail.yourdomain.com.   A      203.0.113.10
yourdomain.com.        MX 10  mail.yourdomain.com.
```

Give DNS a few minutes (sometimes longer) to propagate, then check it actually took before moving on:

```bash
nslookup -type=MX yourdomain.com
```

You don't need SPF, DKIM, or DMARC records for this to work. Those exist to make outbound mail trustworthy, and Cindermail never sends mail over SMTP, it only receives. Same story for reverse DNS (a PTR record) on your server's IP, that's a sender reputation thing too, irrelevant here.

## 3. Configure

```bash
cp .env.example .env
```

Fill in `DISPOSABLE_DOMAIN`. Leave the three `DISCORD_*` fields for now, you'll fill those in during the Discord setup guide. See [configuration.md](configuration.md) for every variable this reads and what it defaults to.

## 4. Run

```bash
npm start
```

The first time this runs it creates `cinderbox.db` (or wherever `SQLITE_PATH` points) and applies the schema automatically. There's no separate init step. You should see something like:

```
Cindermail starting. domain: yourdomain.com, storage: ./cinderbox.db
Interactions HTTP server listening on :8787 (POST /interactions)
SMTP server listening on 0.0.0.0:25
```

Run this under something that'll restart it if it crashes and keep it alive after you log out, `systemd`, `pm2`, or Docker's own restart policy. Don't just leave it in a bare terminal.

## 5. Get the webhook onto HTTPS

Discord requires its Interactions Endpoint URL to be HTTPS. The HTTP server this starts on `HTTP_PORT` is plain HTTP with no certificate of its own, so you need a reverse proxy in front of it: Caddy, nginx, or a tunnel like Cloudflare Tunnel or ngrok. Caddy is the easiest option if you don't already have a preference, it gets you a real Let's Encrypt certificate with almost no configuration.

If you do use Cloudflare Tunnel here, it's only acting as a reverse proxy for this one HTTP endpoint. It doesn't require Email Routing or D1 or anything else, so it doesn't quietly pull the Cloudflare dependency back in that this whole path is meant to avoid.

Once you have an HTTPS URL pointed at this server, hang onto it, you'll need it for the Discord setup guide: [discord-adapter.md](discord-adapter.md).

## Running with Docker instead

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

The image runs as a non-root user and listens on unprivileged port `2525` internally by default. `-p 25:2525` maps the real port 25 to it at the Docker level, so the container itself never needs elevated privileges to bind a low port. `SQLITE_PATH` defaults to `/data/cinderbox.db` inside the image, and the named volume keeps that data around across container recreation.
