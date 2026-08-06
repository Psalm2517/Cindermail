# Setting up the Discord adapter

This is the step that actually gets mail delivered to you. [deploy-cloudflare.md](deploy-cloudflare.md) only gets mail as far as "received and stored," so finish that first. It's the same either way, domain mode or mail.tm mode.

## 1. Create a Discord application

Go to [discord.com/developers/applications](https://discord.com/developers/applications) and create a new application. Give it a bot user under the Bot tab if it doesn't already have one.

From the General Information and Bot tabs, grab three values:

- The bot token
- The public key (labeled "Public Key" on General Information)
- The application ID

## 2. Give it those credentials

```bash
npx wrangler secret put DISCORD_TOKEN
npx wrangler secret put DISCORD_PUBLIC_KEY
npx wrangler secret put DISCORD_APPLICATION_ID
```

Each one prompts you to paste the value in. They're stored encrypted by Cloudflare, never written to a file in this repo. `npm run setup` offers to run these three for you.

## 3. Register the slash commands

With `DISCORD_TOKEN` and `DISCORD_APPLICATION_ID` set in your environment:

```bash
npm run register-commands
```

This registers `/new`, `/list`, `/extend`, and `/torch` with Discord. It only needs to run again if you change a command's name or arguments, not every deploy.

## 4. Point Discord at your interactions endpoint

Back in the Discord Developer Portal, on the General Information tab, set the Interactions Endpoint URL to your Worker's URL plus `/interactions`:

```
https://<your-worker>.<your-subdomain>.workers.dev/interactions
```

Discord verifies this by sending a signed ping the moment you save it. If that fails, it's almost always one of two things: the `DISCORD_PUBLIC_KEY` you set doesn't match the app's actual Verify Key, or the Worker isn't deployed yet.

## 5. Try it

The bot works installed to a server, or installed to just your own account for DM only use, both are enabled by default by `register-commands.ts`. Grab an install link from the Installation tab in the Developer Portal.

Run `/new` somewhere you have the bot. You should get a reply only you can see, with a fresh address. Send that address a test email and you should get a DM back within a few seconds.

Mail always arrives as a DM, even if you installed the bot to a server and ran `/new` in a channel there. Commands can be run wherever the bot is available, but delivery never posts anywhere public, it only ever goes to the DM of whoever owns the address.

Everything in a delivered email is treated as hostile, because anyone who learns an address can send to it. Markdown in the body, subject, and sender is escaped, so a message can't arrive as a link whose visible text says `yourbank.com` while pointing somewhere else. Links found in HTML mail are rendered as `label (<https://the-real-url>)` with the destination always visible, and mentions are stripped of their ability to ping.

## Commands

Every reply is ephemeral, a Discord message type only the person who ran the command can see.

| Command | What it does | Default rate limit |
|---|---|---|
| `/new [expiry] [note]` | Creates an address. Permanent unless you set `expiry`. | 1 per 30s |
| `/list` | Lists your active addresses, their notes, and when they expire. | 15 per 60s |
| `/extend <address> [expiry]` | Changes when an address expires. | 15 per 60s |
| `/note <address> [note]` | Labels an address. Blank clears it. | 15 per 60s |
| `/torch <address>` | Revokes an address. | 15 per 60s |

## Notes

A random ten character local part tells you nothing about what you used it for. `note` is an optional label, up to 80 characters, that shows up next to the address in `/list`:

```
/new note: netflix trial
/note address: x7k2p9qzrm@you.com note: bank alerts
/note address: x7k2p9qzrm@you.com            removes the label
```

Notes are only ever shown back to the person who owns the address, in the same ephemeral replies as everything else.

## Expiry

`expiry` is a number of **days** on both `/new` and `/extend`. `0` always means permanent.

```
/new                                  permanent, good until you torch it
/new expiry: 7                        expires in 7 days
/new expiry: 0                        permanent, same as leaving it off

/extend address: x@you.com            pushes expiry out 10 days
/extend address: x@you.com expiry: 5  expires 5 days from now
/extend address: x@you.com expiry: 0  makes it permanent
```

The one asymmetry worth remembering: a bare `/new` is permanent, but a bare `/extend` gives you the 10 day default. `/extend` without arguments should do what its name says.

`/extend` sets expiry relative to now, it doesn't add to what's left. Extending an address with 8 days remaining by `expiry: 5` leaves 5 days, not 13.

Permanent addresses count against your active address limit like any other, and `/list` shows them as `permanent` instead of a countdown. Daily cleanup skips them, so `/torch` is the only thing that ends one.

The 10 day default and the 5 address limit are both configurable, see [configuration.md](configuration.md).
