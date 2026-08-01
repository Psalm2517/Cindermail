import {
  countActiveAddresses,
  createAddress,
  extendAddress,
  listActiveAddresses,
  revokeAddress,
} from "../../core/db";
import { checkAndIncrement } from "../../core/ratelimit";
import type { OwnerRef } from "../../core/types";

const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;
const MAX_ACTIVE_ADDRESSES = 5;
const NEW_RATE_LIMIT_WINDOW_SECONDS = 30;
const NEW_RATE_LIMIT_MAX = 1;

const EPHEMERAL = 64;

interface DiscordInteractionOption {
  name: string;
  value?: string;
}

interface DiscordInteraction {
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

export async function handleInteraction(interaction: DiscordInteraction, db: D1Database, domain: string) {
  const userId = getInvokingUserId(interaction);
  if (!userId) {
    return ephemeralReply("Could not identify the invoking user.");
  }
  const owner: OwnerRef = { type: "discord", id: userId };
  const commandName = interaction.data?.name;

  switch (commandName) {
    case "new":
      return handleNew(db, owner, domain);
    case "list":
      return handleList(db, owner);
    case "extend":
      return handleExtend(db, owner, getOption(interaction, "address"));
    case "torch":
      return handleTorch(db, owner, getOption(interaction, "address"));
    default:
      return ephemeralReply("Unknown command.");
  }
}

async function handleNew(db: D1Database, owner: OwnerRef, domain: string) {
  const allowed = await checkAndIncrement(
    db,
    owner.type,
    owner.id,
    "new",
    NEW_RATE_LIMIT_WINDOW_SECONDS,
    NEW_RATE_LIMIT_MAX
  );
  if (!allowed) {
    return ephemeralReply("You're creating addresses too quickly. Try again in a bit.");
  }

  const activeCount = await countActiveAddresses(db, owner);
  if (activeCount >= MAX_ACTIVE_ADDRESSES) {
    return ephemeralReply(`You already have ${MAX_ACTIVE_ADDRESSES} active addresses. Revoke one before creating another.`);
  }

  const address = await createAddress(db, owner, domain, SEVEN_DAYS_SECONDS);
  return ephemeralReply(`Your new disposable address: \`${address}\`\nExpires in 7 days.`);
}

async function handleList(db: D1Database, owner: OwnerRef) {
  const addresses = await listActiveAddresses(db, owner);
  if (addresses.length === 0) {
    return ephemeralReply("You have no active addresses.");
  }
  const lines = addresses.map((a) => `\`${a.address}\` — expires <t:${a.expires_at}:R>`);
  return ephemeralReply(lines.join("\n"));
}

async function handleExtend(db: D1Database, owner: OwnerRef, address: string | undefined) {
  if (!address) {
    return ephemeralReply("Missing address.");
  }
  const updated = await extendAddress(db, owner, address, SEVEN_DAYS_SECONDS);
  if (!updated) {
    return ephemeralReply("Not found or not yours.");
  }
  return ephemeralReply(`Extended \`${address}\` by 7 days.`);
}

async function handleTorch(db: D1Database, owner: OwnerRef, address: string | undefined) {
  if (!address) {
    return ephemeralReply("Missing address.");
  }
  const updated = await revokeAddress(db, owner, address);
  if (!updated) {
    return ephemeralReply("Not found or not yours.");
  }
  return ephemeralReply(`Torched \`${address}\`.`);
}
