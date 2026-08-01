import { fileURLToPath, URL as NodeURL } from "node:url";
import { SMTPServer, type SMTPServerDataStream, type SMTPServerSession } from "smtp-server";
import { createDiscordAdapter } from "../adapters/discord/index.ts";
import { buildCommandConfig } from "../adapters/discord/config.ts";
import { createAddress, deleteExpiredAndRevoked, deleteStaleRateLimits } from "../core/db.ts";
import { createDispatcher } from "../core/dispatch.ts";
import { handleInboundEmail } from "../core/email.ts";
import type { SqlExecutor } from "../core/storage.ts";
import type { MailAdapter, OwnerRef } from "../core/types.ts";
import { createSqliteExecutor, openSqliteDatabase } from "../storage/sqlite.ts";
import { scheduleCleanup } from "./cleanup-schedule.ts";
import { loadNodeHostConfig } from "./config.ts";
import { startHttpServer } from "./http-server.ts";

const CLEANUP_GRACE_SECONDS = 24 * 60 * 60;
const STALE_RATE_LIMIT_SECONDS = 30 * 24 * 60 * 60;

function buildAdapters(adapters: string[], discordToken: string): MailAdapter[] {
  const list: MailAdapter[] = [];
  if (adapters.includes("discord")) {
    list.push(createDiscordAdapter(discordToken));
  }
  return list;
}

function startSmtpServer(config: ReturnType<typeof loadNodeHostConfig>, db: SqlExecutor, dispatcher: ReturnType<typeof createDispatcher>) {
  const server = new SMTPServer({
    disabledCommands: ["AUTH", "STARTTLS"],
    onRcptTo(address, _session, callback) {
      const domain = address.address.split("@")[1]?.toLowerCase();
      if (domain !== config.disposableDomain.toLowerCase()) {
        return callback(new Error("550 No such mailbox here"));
      }
      callback();
    },
    onData(stream: SMTPServerDataStream, session: SMTPServerSession, callback) {
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => {
        const raw = Buffer.concat(chunks);
        const from = session.envelope.mailFrom ? session.envelope.mailFrom.address : "unknown";

        // A single SMTP transaction can name multiple recipients (RCPT TO can
        // repeat) even though in practice this is always exactly one
        // catch-all address; handle both.
        const deliveries = session.envelope.rcptTo.map((rcpt) =>
          handleInboundEmail({ to: rcpt.address, from, raw }, db, dispatcher).catch((err: unknown) => {
            console.error("inbound email handling failed:", err instanceof Error ? err.message : err);
          })
        );

        Promise.all(deliveries)
          .then(() => callback())
          .catch(() => callback());
      });
    },
  });

  server.on("error", (err) => console.error("SMTP server error:", err.message));
  server.listen(config.smtpPort, config.smtpHost, () => {
    console.log(`SMTP server listening on ${config.smtpHost}:${config.smtpPort}`);
  });
  return server;
}

function main() {
  const config = loadNodeHostConfig();
  const rawDb = openSqliteDatabase(config.sqlitePath, fileURLToPath(new NodeURL("../../schema.sql", import.meta.url)));
  const db = createSqliteExecutor(rawDb);
  const dispatcher = createDispatcher(buildAdapters(config.adapters, config.discordToken));
  const commandConfig = buildCommandConfig(process.env as Record<string, string | undefined>);
  const createAddressFn = (executor: SqlExecutor, owner: OwnerRef, ttl: number) =>
    createAddress(executor, owner, config.disposableDomain, ttl);

  console.log(`Cindermail starting. domain: ${config.disposableDomain}, storage: ${config.sqlitePath}`);
  startSmtpServer(config, db, dispatcher);
  startHttpServer(config.httpPort, config.discordPublicKey, db, createAddressFn, commandConfig);
  scheduleCleanup(() => {
    deleteExpiredAndRevoked(db, CLEANUP_GRACE_SECONDS).catch((err: unknown) =>
      console.error("cleanup (addresses) failed:", err instanceof Error ? err.message : err)
    );
    deleteStaleRateLimits(db, STALE_RATE_LIMIT_SECONDS).catch((err: unknown) =>
      console.error("cleanup (rate limits) failed:", err instanceof Error ? err.message : err)
    );
  });
}

main();
