# Architecture

```
src/core/             Address CRUD, rate limiting, dispatch, MIME parsing.
                       Doesn't import from adapters/ or storage/.
src/core/storage.ts    SqlExecutor: the run/first/all interface core runs
                       SQL against. D1 and SQLite are both SQLite dialect,
                       so core/db.ts and core/ratelimit.ts are shared
                       between them word for word.
src/storage/           d1.ts and sqlite.ts, the two SqlExecutor drivers.
src/adapters/          Delivery adapters. discord/ ships built in.
src/worker.ts          Cloudflare entrypoint.
src/node/               Self-hosted entrypoint (SMTP server, HTTP server
                         for the Discord webhook, cleanup schedule).
src/receivers/mailtm/  mail.tm entrypoint (API client, poller instead of
                         SMTP, its own cleanup that deletes the mail.tm
                         account before dropping the row).
```

## Extending it

**Delivery adapter.** Implement `MailAdapter` in `src/core/types.ts`: a `name`, and a `deliver(owner, mail)` that returns `{ success, error? }` and never throws. Register it in `buildAdapters()`.

**Storage or receiving backend.** Implement `SqlExecutor` in `src/core/storage.ts`. Call `handleInboundEmail({ to, from, raw }, db, dispatcher)` from `core/email.ts` for each piece of mail. `raw` takes a `Buffer`, `ReadableStream`, or string, whatever `postal-mime` accepts.
