# Configuration reference

Cloudflare deployments set these in `wrangler.jsonc` under `vars` for non-secret values, or via `wrangler secret put` for secrets. Self-hosted deployments set all of them in `.env`.

| Variable | Secret? | Default | What it does |
|---|---|---|---|
| `DISPOSABLE_DOMAIN` | no | required (Cloudflare and self-hosted only) | The domain addresses get generated on. Not used, and not needed, in mail.tm mode. |
| `ADAPTERS` | no | `discord` | Comma separated list of enabled delivery adapters. |
| `DISCORD_TOKEN` | yes | required, no default | Bot token. |
| `DISCORD_PUBLIC_KEY` | yes | required, no default | Used to verify that interaction requests actually came from Discord. |
| `DISCORD_APPLICATION_ID` | yes | required, no default | Used by `register-commands.ts`. |
| `MAX_ACTIVE_ADDRESSES` | no | `5` | How many addresses one owner can have active at the same time. |
| `ADDRESS_TTL_SECONDS` | no | `864000` (10 days) | How long a new or extended address lives before it expires. Addresses marked permanent ignore this, see [discord-adapter.md](discord-adapter.md#permanent-addresses). |
| `RATE_LIMIT_<CMD>_WINDOW_SECONDS` | no | see below | Window length for a given command's rate limit. `<CMD>` is one of `NEW`, `LIST`, `EXTEND`, `TORCH`. |
| `RATE_LIMIT_<CMD>_MAX` | no | see below | Max calls allowed per window. Set this to `0` and that command's rate limit is disabled entirely. |

Rate limit defaults: `NEW` is 30 seconds and 1 call, `LIST`, `EXTEND`, and `TORCH` are each 60 seconds and 15 calls.

These limits exist to keep a deployment other people can reach from getting hammered. They aren't safety rails baked in for your own protection, so there's no reason to leave them on if you don't want them. Worth knowing though: they're already scoped per owner, not shared across everyone using the bot, so if you're self-hosting just for yourself you probably won't ever notice them even at the defaults. There's usually nothing to change. If you do want them gone anyway, set every `RATE_LIMIT_*_MAX` to `0`.

## Self-hosted only

These have no Cloudflare equivalent. See `.env.example` for the full commented list.

| Variable | Default | What it does |
|---|---|---|
| `SMTP_PORT` | `25` | Port the SMTP server listens on for inbound mail. |
| `SMTP_HOST` | `0.0.0.0` | Interface the SMTP server binds to. |
| `HTTP_PORT` | `8787` | Port the interactions HTTP server listens on. Put a reverse proxy in front for HTTPS, see the self-host guide. |
| `SQLITE_PATH` | `./cinderbox.db` | Where the SQLite database file lives. Gets created automatically if it doesn't exist. |

## mail.tm mode only

Also uses `HTTP_PORT`, `SQLITE_PATH`, and `ADAPTERS` from the table above. Does not use `DISPOSABLE_DOMAIN`, `SMTP_PORT`, or `SMTP_HOST` at all, there's no SMTP server in this mode.

| Variable | Default | What it does |
|---|---|---|
| `MAILTM_POLL_INTERVAL_SECONDS` | `15` | How often to check mail.tm for new mail on each active address. |
