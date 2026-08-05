import { countActiveAddresses, extendAddress, listActiveAddresses, revokeAddress } from "../../core/db.ts";
import { checkAndIncrement } from "../../core/ratelimit.ts";
import type { SqlExecutor } from "../../core/storage.ts";
import type { OwnerRef } from "../../core/types.ts";
import type { CommandConfig } from "./config.ts";

const EPHEMERAL = 64;

const RATE_LIMIT_MESSAGE = "Slow down a moment, then try again.";

// How a new address actually gets created differs by receiver: Cloudflare
// and self-hosted SMTP invent a random local part on a domain you own,
// mail.tm calls an external API and gets an address back. Injecting this
// keeps command handling identical across every receiver instead of each
// one needing its own copy of /new, /list, /extend, /torch.
export type CreateAddressFn = (
  db: SqlExecutor,
  owner: OwnerRef,
  ttlSeconds: number,
  permanent: boolean
) => Promise<string>;

interface DiscordInteractionOption {
  name: string;
  value?: string | boolean;
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
  const value = interaction.data?.options?.find((o) => o.name === name)?.value;
  return typeof value === "string" ? value : undefined;
}

// Discord sends booleans for BOOLEAN options. Undefined means the option was
// left off entirely, which callers treat differently from an explicit false.
function getBooleanOption(interaction: DiscordInteraction, name: string): boolean | undefined {
  const value = interaction.data?.options?.find((o) => o.name === name)?.value;
  return typeof value === "boolean" ? value : undefined;
}

export async function handleInteraction(
  interaction: DiscordInteraction,
  db: SqlExecutor,
  createAddressFn: CreateAddressFn,
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
      return handleNew(db, owner, createAddressFn, config, getBooleanOption(interaction, "permanent") ?? false);
    case "list":
      return handleList(db, owner);
    case "extend":
      return handleExtend(
        db,
        owner,
        getOption(interaction, "address"),
        config,
        getBooleanOption(interaction, "permanent")
      );
    case "torch":
      return handleTorch(db, owner, getOption(interaction, "address"));
    default:
      return ephemeralReply("Unknown command.");
  }
}

async function handleNew(
  db: SqlExecutor,
  owner: OwnerRef,
  createAddressFn: CreateAddressFn,
  config: CommandConfig,
  permanent: boolean
) {
  const activeCount = await countActiveAddresses(db, owner);
  if (activeCount >= config.maxActiveAddresses) {
    return ephemeralReply(
      `You already have ${config.maxActiveAddresses} active addresses. Torch one before creating another.`
    );
  }

  const address = await createAddressFn(db, owner, config.addressTtlSeconds, permanent);
  if (permanent) {
    return ephemeralReply(`Your new disposable address: \`${address}\`\nPermanent, good until you torch it.`);
  }
  const days = Math.round(config.addressTtlSeconds / 86400);
  return ephemeralReply(`Your new disposable address: \`${address}\`\nExpires in ${days} day${days === 1 ? "" : "s"}.`);
}

async function handleList(db: SqlExecutor, owner: OwnerRef) {
  const addresses = await listActiveAddresses(db, owner);
  if (addresses.length === 0) {
    return ephemeralReply("You have no active addresses.");
  }
  const lines = addresses.map((a) =>
    a.permanent === 1 ? `\`${a.address}\`, permanent` : `\`${a.address}\`, expires <t:${a.expires_at}:R>`
  );
  return ephemeralReply(lines.join("\n"));
}

async function handleExtend(
  db: SqlExecutor,
  owner: OwnerRef,
  address: string | undefined,
  config: CommandConfig,
  permanent: boolean | undefined
) {
  if (!address) {
    return ephemeralReply("Missing address.");
  }
  const updated = await extendAddress(db, owner, address, config.addressTtlSeconds, permanent);
  if (!updated) {
    return ephemeralReply("Not found or not yours.");
  }

  const days = Math.round(config.addressTtlSeconds / 86400);
  if (permanent === true) {
    return ephemeralReply(`\`${address}\` is now permanent, good until you torch it.`);
  }
  if (permanent === false) {
    return ephemeralReply(`\`${address}\` is no longer permanent. Expires in ${days} day${days === 1 ? "" : "s"}.`);
  }
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
