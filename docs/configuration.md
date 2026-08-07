# Configuration reference

Everything is read from the Worker's environment, so anything below works either as a secret (`wrangler secret put NAME`) or as a plain `vars` entry in `wrangler.jsonc`.

Use secrets for anything specific to your deployment. `wrangler.jsonc` is committed, so values there ship to everyone who clones it, and plaintext dashboard variables get overwritten on the next deploy by whatever that file declares. Secrets stay out of the repo and survive deploys. Only `ADAPTERS` sits in `vars`, because it's the same everywhere.

| Variable | Required | Default | What it does |
|---|---|---|---|
| `DISCORD_TOKEN` | yes | | Bot token. |
| `DISCORD_PUBLIC_KEY` | yes | | Verifies that interactions actually came from Discord. |
| `DISCORD_APPLICATION_ID` | yes | | Used by `register-commands.ts`. |
| `DISPOSABLE_DOMAIN` | no | unset | Domain addresses are generated on. Unset means mail.tm mode: addresses on mail.tm's domain, no domain of your own needed. |
| `ADAPTERS` | no | `discord` | Comma separated list of enabled delivery adapters. |
| `MAX_ACTIVE_ADDRESSES` | no | `5` | Addresses one owner can hold at once. |
| `ADDRESS_TTL_SECONDS` | no | `864000` (10 days) | What a bare `/extend` uses. `/new` is permanent by default and ignores this unless given an explicit `expiry`. |
| `RATE_LIMIT_<CMD>_WINDOW_SECONDS` | no | see below | Window length for a command's rate limit. `<CMD>` is `NEW`, `LIST`, `EXTEND`, `TORCH`, `NOTE` or `REMIND`. |
| `RATE_LIMIT_<CMD>_MAX` | no | see below | Calls allowed per window. `0` disables that command's limit. |

Rate limit defaults: `NEW` is 1 call per 30 seconds, everything else 15 per 60.

They're there to stop a deployment other people can reach getting hammered, not to protect you from yourself. Scoped per owner rather than shared, so running this for yourself you'll likely never hit them. Set every `RATE_LIMIT_*_MAX` to `0` to remove them.

## Cron triggers

In `wrangler.jsonc` under `triggers.crons`, not variables:

| Schedule | What it does |
|---|---|
| `0 3 * * *` | Daily: deletes expired and torched addresses, clears stale rate-limit rows, sends expiry reminders, and in mail.tm mode deletes the remote mailbox behind each dropped address. |
| `*/1 * * * *` | Polls mail.tm. Returns before touching the database when `DISPOSABLE_DOMAIN` is set, so it costs nothing in domain mode. |

The one minute floor on cron triggers is why mail.tm mode averages about 30 seconds to deliver.

Times are UTC. The daily one sends reminder DMs, so its hour decides when people get notified.
