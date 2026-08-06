import { verifyKey } from "discord-interactions";
import { buildCommandConfig } from "../../adapters/discord/config.ts";
import { createDiscordAdapter } from "../../adapters/discord/index.ts";
import { handleInteraction, type DiscordInteraction } from "../../adapters/discord/interactions.ts";
import { deleteStaleRateLimits } from "../../core/db.ts";
import { createDispatcher } from "../../core/dispatch.ts";
import type { MailAdapter } from "../../core/types.ts";
import { createD1Executor } from "../../storage/d1.ts";
import { createMailtmAddress } from "./address.ts";
import { runMailtmCleanup } from "./cleanup.ts";
import { pollOnce } from "./poller.ts";

// mail.tm on Cloudflare Workers: no domain, no Email Routing, no server to
// keep alive. mail.tm receives mail on their own infrastructure, this Worker
// just polls them (on a Cron Trigger, see wrangler.jsonc's two schedules)
// instead of receiving inbound mail directly the way src/worker.ts does.
export interface Env {
  DB: D1Database;
  ADAPTERS: string;
  DISCORD_TOKEN: string;
  DISCORD_PUBLIC_KEY: string;
  DISCORD_APPLICATION_ID: string;
  // Optional overrides for adapters/discord/config.ts defaults, see
  // docs/configuration.md for the full list of accepted vars.
  [key: string]: unknown;
}

const STALE_RATE_LIMIT_SECONDS = 30 * 24 * 60 * 60;

// Matches the daily schedule in wrangler.jsonc. Anything else that fires
// scheduled() is the frequent poll trigger, so it doesn't need its own
// constant, just "not this one."
const CLEANUP_CRON = "0 3 * * *";

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
        // createMailtmAddress already matches CreateAddressFn's signature
        // exactly (db, owner, ttlSeconds, permanent), no domain param to
        // inject the way src/worker.ts has to for createAddress.
        const result = await handleInteraction(interaction, db, createMailtmAddress, config);
        return Response.json(result);
      }

      return new Response("unsupported interaction type", { status: 400 });
    }

    return new Response("not found", { status: 404 });
  },

  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    const db = createD1Executor(env.DB);

    if (event.cron === CLEANUP_CRON) {
      await runMailtmCleanup(db);
      await deleteStaleRateLimits(db, STALE_RATE_LIMIT_SECONDS);
      return;
    }

    const dispatcher = createDispatcher(buildAdapters(env));
    await pollOnce(db, dispatcher);
  },
};
