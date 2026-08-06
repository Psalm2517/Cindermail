import {
  countActiveAddresses,
  extendAddress,
  listActiveAddresses,
  revokeAddress,
  setAddressNote,
} from "../../core/db.ts";
import { checkAndIncrement } from "../../core/ratelimit.ts";
import type { SqlExecutor } from "../../core/storage.ts";
import type { OwnerRef } from "../../core/types.ts";
import type { CommandConfig } from "./config.ts";

const EPHEMERAL = 64;

const RATE_LIMIT_MESSAGE = "Slow down a moment, then try again.";

// How a new address actually gets created differs by mode: a domain you own
// means inventing a random local part, mail.tm means calling their API and
// getting an address back. Injecting this keeps command handling identical
// across both instead of each needing its own copy of /new, /list, /extend,
// /torch.
export type CreateAddressFn = (
  db: SqlExecutor,
  owner: OwnerRef,
  ttlSeconds: number,
  permanent: boolean,
  note: string | null
) => Promise<string>;

// Matches max_length on the registered `note` option. Long enough to be a
// useful label, short enough that /list stays scannable.
const MAX_NOTE_LENGTH = 80;

// The largest expiry we'll accept, in days. Beyond this the seconds value
// starts approaching the point where it stops being a meaningful timestamp,
// and anyone wanting longer than this wants a permanent address anyway.
const MAX_EXPIRY_DAYS = 3650;

interface DiscordInteractionOption {
  name: string;
  value?: string | number;
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

// Discord sends numbers for INTEGER options. Undefined means the option was
// left off entirely, which every caller treats differently from an explicit
// value (notably 0, which means permanent).
function getIntegerOption(interaction: DiscordInteraction, name: string): number | undefined {
  const value = interaction.data?.options?.find((o) => o.name === name)?.value;
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

interface Expiry {
  ttlSeconds: number;
  permanent: boolean;
}

// `expiry` is in days, 0 meaning permanent. Discord enforces the
// 0..MAX_EXPIRY_DAYS range itself via min_value/max_value on the registered
// command, so this is a backstop for anything reaching the endpoint another
// way.
//
// Permanent still carries the default TTL rather than 0: core/db.ts keeps
// expires_at fresh even on permanent rows deliberately, so that dropping the
// flag later leaves a usable expiry instead of one that lapsed while the
// address was permanent.
function parseExpiry(days: number, defaultTtlSeconds: number): Expiry | null {
  if (days < 0 || days > MAX_EXPIRY_DAYS) {
    return null;
  }
  return days === 0
    ? { ttlSeconds: defaultTtlSeconds, permanent: true }
    : { ttlSeconds: days * 86400, permanent: false };
}

function describeExpiry(expiry: Expiry): string {
  if (expiry.permanent) {
    return "Permanent, good until you torch it.";
  }
  const days = Math.round(expiry.ttlSeconds / 86400);
  return `Expires in ${days} day${days === 1 ? "" : "s"}.`;
}

const BAD_EXPIRY_MESSAGE = `\`expiry\` must be a whole number of days between 0 and ${MAX_EXPIRY_DAYS}. Use 0 for permanent.`;

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
      return handleNew(
        db,
        owner,
        createAddressFn,
        config,
        getIntegerOption(interaction, "expiry"),
        getOption(interaction, "note")
      );
    case "list":
      return handleList(db, owner);
    case "note":
      return handleNote(db, owner, getOption(interaction, "address"), getOption(interaction, "note") ?? "");
    case "extend":
      return handleExtend(
        db,
        owner,
        getOption(interaction, "address"),
        config,
        getIntegerOption(interaction, "expiry")
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
  expiryDays: number | undefined,
  note: string | undefined
) {
  // Leaving `expiry` off means permanent. Addresses are meant to outlive
  // whatever you signed up for unless you say otherwise.
  const expiry =
    expiryDays === undefined
      ? { ttlSeconds: config.addressTtlSeconds, permanent: true }
      : parseExpiry(expiryDays, config.addressTtlSeconds);
  if (!expiry) {
    return ephemeralReply(BAD_EXPIRY_MESSAGE);
  }

  const activeCount = await countActiveAddresses(db, owner);
  if (activeCount >= config.maxActiveAddresses) {
    return ephemeralReply(
      `You already have ${config.maxActiveAddresses} active addresses. Torch one before creating another.`
    );
  }

  const trimmedNote = note?.trim().slice(0, MAX_NOTE_LENGTH) || null;
  const address = await createAddressFn(db, owner, expiry.ttlSeconds, expiry.permanent, trimmedNote);
  const label = trimmedNote ? ` (${trimmedNote})` : "";
  return ephemeralReply(`Your new disposable address: \`${address}\`${label}\n${describeExpiry(expiry)}`);
}

async function handleNote(db: SqlExecutor, owner: OwnerRef, address: string | undefined, note: string) {
  if (!address) {
    return ephemeralReply("Missing address.");
  }
  const trimmed = note.trim().slice(0, MAX_NOTE_LENGTH);
  const updated = await setAddressNote(db, owner, address, trimmed);
  if (!updated) {
    return ephemeralReply("Not found or not yours.");
  }
  return trimmed
    ? ephemeralReply(`\`${address}\` is now labelled "${trimmed}".`)
    : ephemeralReply(`Cleared the note on \`${address}\`.`);
}

async function handleList(db: SqlExecutor, owner: OwnerRef) {
  const addresses = await listActiveAddresses(db, owner);
  if (addresses.length === 0) {
    return ephemeralReply("You have no active addresses.");
  }
  const lines = addresses.map((a) => {
    const when = a.permanent === 1 ? "permanent" : `expires <t:${a.expires_at}:R>`;
    // Notes are user-supplied, so strip backticks to stop one from breaking
    // out of the code span and mangling the rest of the line.
    const label = a.note ? ` ${a.note.replaceAll("`", "")} ` : " ";
    return `\`${a.address}\`${label}(${when})`;
  });
  return ephemeralReply(lines.join("\n"));
}

async function handleExtend(
  db: SqlExecutor,
  owner: OwnerRef,
  address: string | undefined,
  config: CommandConfig,
  expiryDays: number | undefined
) {
  if (!address) {
    return ephemeralReply("Missing address.");
  }

  // Unlike /new, leaving `expiry` off here means the configured default
  // rather than permanent: /extend without arguments should do the thing
  // its name says.
  const expiry =
    expiryDays === undefined
      ? { ttlSeconds: config.addressTtlSeconds, permanent: false }
      : parseExpiry(expiryDays, config.addressTtlSeconds);
  if (!expiry) {
    return ephemeralReply(BAD_EXPIRY_MESSAGE);
  }

  const updated = await extendAddress(db, owner, address, expiry.ttlSeconds, expiry.permanent);
  if (!updated) {
    return ephemeralReply("Not found or not yours.");
  }

  if (expiry.permanent) {
    return ephemeralReply(`\`${address}\` is now permanent, good until you torch it.`);
  }
  const days = Math.round(expiry.ttlSeconds / 86400);
  return ephemeralReply(`\`${address}\` now expires in ${days} day${days === 1 ? "" : "s"}.`);
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
