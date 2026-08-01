import {
  countActiveAddresses,
  createAddress,
  extendAddress,
  listActiveAddresses,
  revokeAddress,
} from "../../core/db.ts";
import { checkAndIncrement } from "../../core/ratelimit.ts";
import type { SqlExecutor } from "../../core/storage.ts";
import type { OwnerRef } from "../../core/types.ts";
import type { CommandConfig } from "./config.ts";

const EPHEMERAL = 64;

const RATE_LIMIT_MESSAGE = "Slow down a moment, then try again.";

interface DiscordInteractionOption {
  name: string;
  value?: string;
}

export interface DiscordInteraction {
  type: number;
  member?: { user?: { id: string } };
  user?: { id: string };
  data?: {
    name: string;
    options?: DiscordInteractionOption[];
  };
}

function ephemeralReply(content: string) {
  return {
    type: 4,
    data: { content, flags: EPHEMERAL },
  };
}

function getInvokingUserId(interaction: DiscordInteraction): string | null {
  return interaction.member?.user?.id ?? interaction.user?.id ?? null;
}

function getOption(interaction: DiscordInteraction, name: string): string | undefined {
  return interaction.data?.options?.find((o) => o.name === name)?.value;
}

export async function handleInteraction(
  interaction: DiscordInteraction,
  db: SqlExecutor,
  domain: string,
  config: CommandConfig
) {
  const userId = getInvokingUserId(interaction);
  if (!userId) {
    return ephemeralReply("Could not identify the invoking user.");
  }
  const owner: OwnerRef = { type: "discord", id: userId };
  const commandName = interaction.data?.name;

  const limit = commandName ? config.rateLimits[commandName] : undefined;
  if (limit) {
    const allowed = await checkAndIncrement(
      db,
      owner.type,
      owner.id,
      commandName as string,
      limit.windowSeconds,
      limit.maxCount
    );
    if (!allowed) {
      return ephemeralReply(RATE_LIMIT_MESSAGE);
    }
  }

  switch (commandName) {
    case "new":
      return handleNew(db, owner, domain, config);
    case "list":
      return handleList(db, owner);
    case "extend":
      return handleExtend(db, owner, getOption(interaction, "address"), config);
    case "torch":
      return handleTorch(db, owner, getOption(interaction, "address"));
    default:
      return ephemeralReply("Unknown command.");
  }
}

async function handleNew(db: SqlExecutor, owner: OwnerRef, domain: string, config: CommandConfig) {
  const activeCount = await countActiveAddresses(db, owner);
  if (activeCount >= config.maxActiveAddresses) {
    return ephemeralReply(
      `You already have ${config.maxActiveAddresses} active addresses. Torch one before creating another.`
    );
  }

  const address = await createAddress(db, owner, domain, config.addressTtlSeconds);
  const days = Math.round(config.addressTtlSeconds / 86400);
  return ephemeralReply(`Your new disposable address: \`${address}\`\nExpires in ${days} day${days === 1 ? "" : "s"}.`);
}

async function handleList(db: SqlExecutor, owner: OwnerRef) {
  const addresses = await listActiveAddresses(db, owner);
  if (addresses.length === 0) {
    return ephemeralReply("You have no active addresses.");
  }
  const lines = addresses.map((a) => `\`${a.address}\` — expires <t:${a.expires_at}:R>`);
  return ephemeralReply(lines.join("\n"));
}

async function handleExtend(
  db: SqlExecutor,
  owner: OwnerRef,
  address: string | undefined,
  config: CommandConfig
) {
  if (!address) {
    return ephemeralReply("Missing address.");
  }
  const updated = await extendAddress(db, owner, address, config.addressTtlSeconds);
  if (!updated) {
    return ephemeralReply("Not found or not yours.");
  }
  const days = Math.round(config.addressTtlSeconds / 86400);
  return ephemeralReply(`Extended \`${address}\` by ${days} day${days === 1 ? "" : "s"}.`);
}

async function handleTorch(db: SqlExecutor, owner: OwnerRef, address: string | undefined) {
  if (!address) {
    return ephemeralReply("Missing address.");
  }
  const updated = await revokeAddress(db, owner, address);
  if (!updated) {
    return ephemeralReply("Not found or not yours.");
  }
  return ephemeralReply(`Torched \`${address}\`.`);
}
