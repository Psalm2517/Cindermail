# Architecture

One Cloudflare Worker. Email Routing (or mail.tm) receives, D1 stores, Discord delivers.

```
src/worker.ts          The entrypoint. fetch() serves Discord interactions
                       and the status page, email() takes inbound mail from
                       Email Routing, scheduled() runs the mail.tm poll and
                       the daily cleanup. Picks domain vs mail.tm mode from
                       whether DISPOSABLE_DOMAIN is set.
src/core/              Address CRUD, rate limiting, dispatch, MIME parsing.
                       Doesn't import from adapters/ or storage/.
src/core/storage.ts    SqlExecutor: the run/first/all interface core runs SQL
                       against, so core has no D1 types in it.
src/storage/d1.ts      The SqlExecutor implementation for D1.
src/adapters/          Delivery adapters. discord/ ships built in.
src/receivers/mailtm/  mail.tm's API client, the poller, and its cleanup
                       (which deletes the remote mailbox before dropping the
                       row). Only used when DISPOSABLE_DOMAIN is empty.
src/counter-page.ts    The status page's HTML, inlined, no external assets.
```

## Two modes, one Worker

`DISPOSABLE_DOMAIN` decides everything:

- **Set.** Addresses are generated on your domain. Cloudflare Email Routing's catch-all rule invokes `email()`. The poll cron returns immediately.
- **Empty.** `createMailtmAddress` provisions a real mailbox on mail.tm per `/new`, and the poll cron checks each one. `email()` is never invoked because nothing routes mail to the Worker.

Everything else, commands, storage, delivery, cleanup, the status page, is identical between them.

## Tests

```bash
npm test
```

Node's built-in runner against a real in-memory SQLite database. No dependencies, no mocks: D1 speaks the same dialect, and these run through the same `SqlExecutor` interface `src/storage/d1.ts` implements.

Covers command semantics, mail rendering, counters, expiry reminders, and that `schema.sql` still agrees with the migration chain. Several cases exist because a failure there once broke mail delivery: a missing `counters` table, and anything thrown by a reminder taking out the cleanup that runs alongside it.

## Extending it

**Delivery adapter.** Implement `MailAdapter` in `src/core/types.ts`: a `name`, a `deliver(owner, mail)` for forwarded email, and a `notify(owner, message)` for plain messages from the bot itself (expiry reminders). Both return `{ success, error? }` and never throw. Register it in `buildAdapters()` in `src/worker.ts`.

**Storage backend.** Implement `SqlExecutor` in `src/core/storage.ts`. Call `handleInboundEmail({ to, from, raw }, db, dispatcher)` from `core/email.ts` for each piece of mail. `raw` takes a `Buffer`, `ReadableStream`, or string, whatever `postal-mime` accepts.
