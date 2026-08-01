import { verifyKey } from "discord-interactions";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { fileURLToPath, URL as NodeURL } from "node:url";
import { SMTPServer, type SMTPServerDataStream, type SMTPServerSession } from "smtp-server";
import { createDiscordAdapter } from "../adapters/discord/index.ts";
import { buildCommandConfig } from "../adapters/discord/config.ts";
import { handleInteraction, type DiscordInteraction } from "../adapters/discord/interactions.ts";
import { deleteExpiredAndRevoked, deleteStaleRateLimits } from "../core/db.ts";
import { createDispatcher } from "../core/dispatch.ts";
import { handleInboundEmail } from "../core/email.ts";
import type { SqlExecutor } from "../core/storage.ts";
import type { MailAdapter } from "../core/types.ts";
import { createSqliteExecutor, openSqliteDatabase } from "../storage/sqlite.ts";
import { loadNodeHostConfig } from "./config.ts";

const CLEANUP_GRACE_SECONDS = 24 * 60 * 60;
const STALE_RATE_LIMIT_SECONDS = 30 * 24 * 60 * 60;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

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

function startHttpServer(
  config: ReturnType<typeof loadNodeHostConfig>,
  db: SqlExecutor,
  commandConfig: ReturnType<typeof buildCommandConfig>
) {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== "POST" || req.url !== "/interactions") {
      res.writeHead(404).end("not found");
      return;
    }

    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      void (async () => {
        const rawBody = Buffer.concat(chunks);
        const signature = req.headers["x-signature-ed25519"];
        const timestamp = req.headers["x-signature-timestamp"];

        if (typeof signature !== "string" || typeof timestamp !== "string") {
          res.writeHead(401).end("missing signature headers");
          return;
        }

        const isValid = await verifyKey(rawBody, signature, timestamp, config.discordPublicKey);
        if (!isValid) {
          res.writeHead(401).end("invalid request signature");
          return;
        }

        let interaction: DiscordInteraction;
        try {
          interaction = JSON.parse(rawBody.toString("utf8")) as DiscordInteraction;
        } catch {
          res.writeHead(400).end("malformed interaction payload");
          return;
        }

        if (interaction.type === 1) {
          res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ type: 1 }));
          return;
        }

        if (interaction.type === 2) {
          const result = await handleInteraction(interaction, db, config.disposableDomain, commandConfig);
          res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(result));
          return;
        }

        res.writeHead(400).end("unsupported interaction type");
      })();
    });
  });

  server.listen(config.httpPort, () => {
    console.log(`Interactions HTTP server listening on :${config.httpPort} (POST /interactions)`);
  });
  return server;
}

function scheduleCleanup(db: SqlExecutor) {
  const run = () => {
    deleteExpiredAndRevoked(db, CLEANUP_GRACE_SECONDS).catch((err: unknown) =>
      console.error("cleanup (addresses) failed:", err instanceof Error ? err.message : err)
    );
    deleteStaleRateLimits(db, STALE_RATE_LIMIT_SECONDS).catch((err: unknown) =>
      console.error("cleanup (rate limits) failed:", err instanceof Error ? err.message : err)
    );
  };

  // Matches the Workers deployment's "0 3 * * *" cron schedule, so cleanup
  // timing is consistent regardless of which host is running.
  const now = new Date();
  const next3am = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 3, 0, 0, 0));
  if (next3am <= now) {
    next3am.setUTCDate(next3am.getUTCDate() + 1);
  }
  setTimeout(() => {
    run();
    setInterval(run, CLEANUP_INTERVAL_MS);
  }, next3am.getTime() - now.getTime());
}

function main() {
  const config = loadNodeHostConfig();
  const rawDb = openSqliteDatabase(config.sqlitePath, fileURLToPath(new NodeURL("../../schema.sql", import.meta.url)));
  const db = createSqliteExecutor(rawDb);
  const dispatcher = createDispatcher(buildAdapters(config.adapters, config.discordToken));
  const commandConfig = buildCommandConfig(process.env as Record<string, string | undefined>);

  console.log(`Cindermail starting. domain: ${config.disposableDomain}, storage: ${config.sqlitePath}`);
  startSmtpServer(config, db, dispatcher);
  startHttpServer(config, db, commandConfig);
  scheduleCleanup(db);
}

main();
