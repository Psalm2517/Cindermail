import { verifyKey } from "discord-interactions";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { CommandConfig } from "../adapters/discord/config.ts";
import { handleInteraction, type CreateAddressFn, type DiscordInteraction } from "../adapters/discord/interactions.ts";
import type { SqlExecutor } from "../core/storage.ts";

// Serves Discord's /interactions webhook. Identical regardless of receiver
// (SMTP, mail.tm), since it only ever talks to the command layer, never to
// however mail happens to arrive.
export function startHttpServer(
  httpPort: number,
  discordPublicKey: string,
  db: SqlExecutor,
  createAddressFn: CreateAddressFn,
  commandConfig: CommandConfig
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

        const isValid = await verifyKey(rawBody, signature, timestamp, discordPublicKey);
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
          const result = await handleInteraction(interaction, db, createAddressFn, commandConfig);
          res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(result));
          return;
        }

        res.writeHead(400).end("unsupported interaction type");
      })();
    });
  });

  server.listen(httpPort, () => {
    console.log(`Interactions HTTP server listening on :${httpPort} (POST /interactions)`);
  });
  return server;
}
