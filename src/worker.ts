import { verifyKey } from "discord-interactions";
import { createDiscordAdapter } from "./adapters/discord/index.ts";
import { buildCommandConfig } from "./adapters/discord/config.ts";
import { handleInteraction, type DiscordInteraction } from "./adapters/discord/interactions.ts";
import { deleteExpiredAndRevoked, deleteStaleRateLimits } from "./core/db.ts";
import { createDispatcher } from "./core/dispatch.ts";
import { handleInboundEmail } from "./core/email.ts";
import type { MailAdapter } from "./core/types.ts";
import { createD1Executor } from "./storage/d1.ts";

export interface Env {
  DB: D1Database;
  DISPOSABLE_DOMAIN: string;
  ADAPTERS: string;
  DISCORD_TOKEN: string;
  DISCORD_PUBLIC_KEY: string;
  DISCORD_APPLICATION_ID: string;
  // Optional overrides for adapters/discord/config.ts defaults — see
  // wrangler.toml.example and the README for the full list of accepted vars.
  [key: string]: unknown;
}

const CLEANUP_GRACE_SECONDS = 24 * 60 * 60;
const STALE_RATE_LIMIT_SECONDS = 30 * 24 * 60 * 60;

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

      let interaction: DiscordInteraction;
      try {
        interaction = JSON.parse(rawBody) as DiscordInteraction;
      } catch {
        return new Response("malformed interaction payload", { status: 400 });
      }

      if (interaction.type === 1) {
        return Response.json({ type: 1 });
      }

      if (interaction.type === 2) {
        const db = createD1Executor(env.DB);
        const config = buildCommandConfig(env as Record<string, string | undefined>);
        const result = await handleInteraction(interaction, db, env.DISPOSABLE_DOMAIN, config);
        return Response.json(result);
      }

      return new Response("unsupported interaction type", { status: 400 });
    }

    return new Response("not found", { status: 404 });
  },

  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    const db = createD1Executor(env.DB);
    const dispatcher = createDispatcher(buildAdapters(env));
    await handleInboundEmail({ to: message.to, from: message.from, raw: message.raw }, db, dispatcher);
  },

  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    const db = createD1Executor(env.DB);
    await deleteExpiredAndRevoked(db, CLEANUP_GRACE_SECONDS);
    await deleteStaleRateLimits(db, STALE_RATE_LIMIT_SECONDS);
  },
};
