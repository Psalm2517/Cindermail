import { fileURLToPath, URL as NodeURL } from "node:url";
import { printBanner } from "../../banner.ts";
import { loadEnvFile } from "../../env-file.ts";
import { createDiscordAdapter } from "../../adapters/discord/index.ts";
import { buildCommandConfig } from "../../adapters/discord/config.ts";
import { createDispatcher } from "../../core/dispatch.ts";
import type { MailAdapter } from "../../core/types.ts";
import { createSqliteExecutor, openSqliteDatabase } from "../../storage/sqlite.ts";
import { scheduleCleanup } from "../../node/cleanup-schedule.ts";
import { startHttpServer } from "../../node/http-server.ts";
import { createMailtmAddress } from "./address.ts";
import { runMailtmCleanup } from "./cleanup.ts";
import { loadMailtmConfig } from "./config.ts";
import { startMailtmPoller } from "./poller.ts";

function buildAdapters(adapters: string[], discordToken: string): MailAdapter[] {
  const list: MailAdapter[] = [];
  if (adapters.includes("discord")) {
    list.push(createDiscordAdapter(discordToken));
  }
  return list;
}

function main() {
  loadEnvFile();
  const config = loadMailtmConfig();
  const rawDb = openSqliteDatabase(config.sqlitePath, fileURLToPath(new NodeURL("../../../schema.sql", import.meta.url)));
  const db = createSqliteExecutor(rawDb);
  const dispatcher = createDispatcher(buildAdapters(config.adapters, config.discordToken));
  const commandConfig = buildCommandConfig(process.env as Record<string, string | undefined>);

  printBanner(`mail.tm mode, storage: ${config.sqlitePath}`);
  startHttpServer(config.httpPort, config.discordPublicKey, db, createMailtmAddress, commandConfig);
  startMailtmPoller(db, dispatcher, config.pollIntervalMs);
  scheduleCleanup(() => runMailtmCleanup(db));
}

main();
