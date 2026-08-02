import { fileURLToPath, URL as NodeURL } from "node:url";
import { countActiveAddresses, createAddress, extendAddress, listActiveAddresses, revokeAddress } from "../core/db.ts";
import type { SqlExecutor } from "../core/storage.ts";
import type { OwnerRef } from "../core/types.ts";
import { createMailtmAddress } from "../receivers/mailtm/address.ts";
import { createSqliteExecutor, openSqliteDatabase } from "../storage/sqlite.ts";
import { loadEnvFile } from "../env-file.ts";
import { loadCliConfig } from "./config.ts";

// The cli adapter is single-user (one machine, one local operator), so
// there's no per-Discord-user owner id to key addresses on. Every address
// created through this tool shares one fixed owner.
const OWNER: OwnerRef = { type: "cli", id: "local" };

interface CliMessageRow {
  id: number;
  address: string;
  from_address: string;
  subject: string;
  body: string;
  received_at: number;
  read: number;
}

function formatExpiry(expiresAt: number): string {
  const seconds = expiresAt - Math.floor(Date.now() / 1000);
  if (seconds <= 0) return "expired";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
}

async function cmdNew(db: SqlExecutor) {
  const config = loadCliConfig();
  const active = await countActiveAddresses(db, OWNER);
  const address = config.disposableDomain
    ? await createAddress(db, OWNER, config.disposableDomain, config.addressTtlSeconds)
    : await createMailtmAddress(db, OWNER, config.addressTtlSeconds);
  console.log(address);
  if (active === 0) {
    console.log("Run the self-hosted or mail.tm server (see docs) with ADAPTERS=cli for this to receive mail.");
  }
}

async function cmdList(db: SqlExecutor) {
  const rows = await listActiveAddresses(db, OWNER);
  if (rows.length === 0) {
    console.log("No active addresses. Create one with `new`.");
    return;
  }
  for (const row of rows) {
    console.log(`${row.address}  expires in ${formatExpiry(row.expires_at)}`);
  }
}

async function cmdExtend(db: SqlExecutor, address: string | undefined) {
  if (!address) {
    console.error("Usage: extend <address>");
    process.exitCode = 1;
    return;
  }
  const config = loadCliConfig();
  const ok = await extendAddress(db, OWNER, address, config.addressTtlSeconds);
  console.log(ok ? `Extended ${address}.` : "Not found or not yours.");
}

async function cmdTorch(db: SqlExecutor, address: string | undefined) {
  if (!address) {
    console.error("Usage: torch <address>");
    process.exitCode = 1;
    return;
  }
  const ok = await revokeAddress(db, OWNER, address);
  console.log(ok ? `Torched ${address}.` : "Not found or not yours.");
}

async function cmdMessages(db: SqlExecutor, address: string | undefined) {
  if (!address) {
    console.error("Usage: messages <address>");
    process.exitCode = 1;
    return;
  }
  const rows = await db.all<CliMessageRow>(
    "SELECT * FROM cli_messages WHERE address = ? ORDER BY received_at DESC",
    address
  );
  if (rows.length === 0) {
    console.log("No messages yet.");
    return;
  }
  for (const row of rows) {
    const marker = row.read ? " " : "*";
    console.log(`${marker} [${row.id}] ${row.from_address}  ${row.subject}`);
  }
}

async function cmdRead(db: SqlExecutor, id: string | undefined) {
  const messageId = id ? Number.parseInt(id, 10) : Number.NaN;
  if (!Number.isFinite(messageId)) {
    console.error("Usage: read <id>");
    process.exitCode = 1;
    return;
  }
  const row = await db.first<CliMessageRow>("SELECT * FROM cli_messages WHERE id = ?", messageId);
  if (!row) {
    console.log("No such message.");
    return;
  }
  await db.run("UPDATE cli_messages SET read = 1 WHERE id = ?", messageId);
  console.log(`From: ${row.from_address}`);
  console.log(`Subject: ${row.subject}`);
  console.log("");
  console.log(row.body);
}

async function main() {
  loadEnvFile();
  const config = loadCliConfig();
  const rawDb = openSqliteDatabase(config.sqlitePath, fileURLToPath(new NodeURL("../../schema.sql", import.meta.url)));
  const db = createSqliteExecutor(rawDb);

  const [command, arg] = process.argv.slice(2);
  switch (command) {
    case "new":
      await cmdNew(db);
      break;
    case "list":
      await cmdList(db);
      break;
    case "extend":
      await cmdExtend(db, arg);
      break;
    case "torch":
      await cmdTorch(db, arg);
      break;
    case "messages":
      await cmdMessages(db, arg);
      break;
    case "read":
      await cmdRead(db, arg);
      break;
    default:
      console.log("Usage: cindermail <new|list|extend|torch|messages|read> [arg]");
      process.exitCode = command ? 1 : 0;
  }
}

main();
