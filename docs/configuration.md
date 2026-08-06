# Configuration reference

Non-secret values go in `wrangler.jsonc` under `vars`. Secrets go through `wrangler secret put`, which stores them encrypted with Cloudflare and never writes them to a file in this repo.

| Variable | Secret? | Default | What it does |
|---|---|---|---|
| `DISPOSABLE_DOMAIN` | no | none | The domain addresses get generated on. Leave it empty to run in mail.tm mode instead, where addresses are provisioned on mail.tm's domain and no domain of your own is needed. |
| `ADAPTERS` | no | `discord` | Comma separated list of enabled delivery adapters. |
| `DISCORD_TOKEN` | yes | required, no default | Bot token. |
| `DISCORD_PUBLIC_KEY` | yes | required, no default | Used to verify that interaction requests actually came from Discord. |
| `DISCORD_APPLICATION_ID` | yes | required, no default | Used by `register-commands.ts`. |
| `MAX_ACTIVE_ADDRESSES` | no | `5` | How many addresses one owner can have active at the same time. |
| `ADDRESS_TTL_SECONDS` | no | `864000` (10 days) | How long a new or extended address lives before it expires. |
| `RATE_LIMIT_<CMD>_WINDOW_SECONDS` | no | see below | Window length for a given command's rate limit. `<CMD>` is one of `NEW`, `LIST`, `EXTEND`, `TORCH`. |
| `RATE_LIMIT_<CMD>_MAX` | no | see below | Max calls allowed per window. Set this to `0` and that command's rate limit is disabled entirely. |

Rate limit defaults: `NEW` is 30 seconds and 1 call, `LIST`, `EXTEND`, and `TORCH` are each 60 seconds and 15 calls.

These limits exist to keep a deployment other people can reach from getting hammered. They aren't safety rails baked in for your own protection, so there's no reason to leave them on if you don't want them. Worth knowing though: they're already scoped per owner, not shared across everyone using the bot, so if you're running this just for yourself you probably won't ever notice them even at the defaults. If you do want them gone anyway, set every `RATE_LIMIT_*_MAX` to `0`.

## Cron triggers

Set in `wrangler.jsonc` under `triggers.crons` rather than as variables:

| Schedule | What it does |
|---|---|
| `0 3 * * *` | Daily cleanup: expired and torched addresses, stale rate-limit rows, and the mail.tm account behind each address in mail.tm mode. |
| `*/1 * * * *` | Polls mail.tm for new mail. Returns immediately without touching the database when `DISPOSABLE_DOMAIN` is set, so it costs nothing in domain mode. |

Cron triggers have a one minute floor, which is what puts mail.tm mode's delivery at roughly 30 seconds on average.
