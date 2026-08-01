import { verifyKey } from "discord-interactions";
import { createDiscordAdapter } from "./adapters/discord";
import { handleInteraction } from "./adapters/discord/interactions";
import { deleteExpiredAndRevoked } from "./core/db";
import { createDispatcher } from "./core/dispatch";
import { handleInboundEmail } from "./core/email";
import type { MailAdapter } from "./core/types";

export interface Env {
  DB: D1Database;
  DISPOSABLE_DOMAIN: string;
  ADAPTERS: string;
  DISCORD_TOKEN: string;
  DISCORD_PUBLIC_KEY: string;
  DISCORD_APPLICATION_ID: string;
}

const CLEANUP_GRACE_SECONDS = 24 * 60 * 60;

function buildAdapters(env: Env): MailAdapter[] {
  const enabled = env.ADAPTERS.split(",").map((s) => s.trim());
  const adapters: MailAdapter[] = [];
  if (enabled.includes("discord")) {
    adapters.push(createDiscordAdapter(env.DISCORD_TOKEN));
  }
  return adapters;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/interactions") {
      const signature = request.headers.get("X-Signature-Ed25519");
      const timestamp = request.headers.get("X-Signature-Timestamp");
      const rawBody = await request.text();

      if (!signature || !timestamp) {
        return new Response("missing signature headers", { status: 401 });
      }

      const isValid = await verifyKey(rawBody, signature, timestamp, env.DISCORD_PUBLIC_KEY);
      if (!isValid) {
        return new Response("invalid request signature", { status: 401 });
      }

      const interaction = JSON.parse(rawBody);

      if (interaction.type === 1) {
        return Response.json({ type: 1 });
      }

      if (interaction.type === 2) {
        const result = await handleInteraction(interaction, env.DB, env.DISPOSABLE_DOMAIN);
        return Response.json(result);
      }

      return new Response("unsupported interaction type", { status: 400 });
    }

    return new Response("not found", { status: 404 });
  },

  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    const dispatcher = createDispatcher(buildAdapters(env));
    await handleInboundEmail(message, env.DB, dispatcher);
  },

  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    await deleteExpiredAndRevoked(env.DB, CLEANUP_GRACE_SECONDS);
  },
};
