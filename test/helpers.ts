import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SqlExecutor } from "../src/core/storage.ts";
import type { OwnerRef } from "../src/core/types.ts";
import type { DiscordInteraction } from "../src/adapters/discord/interactions.ts";

// Resolved against this file rather than the working directory, so the tests
// pass no matter where they're invoked from.
const repoFile = (name: string) => join(import.meta.dirname, "..", name);

// A real SQLite database rather than a stub: these tests are mostly about
// whether the SQL is right, which a hand-rolled fake would never catch. D1
// speaks the same dialect, and src/storage/d1.ts implements this same
// interface against it.
export function testDb(): { db: SqlExecutor; raw: DatabaseSync } {
  const raw = new DatabaseSync(":memory:");
  raw.exec(readFileSync(repoFile("schema.sql"), "utf8"));
  const db: SqlExecutor = {
    async run(sql, ...params) {
      const result = raw.prepare(sql).run(...(params as never[]));
      return { changes: Number(result.changes) };
    },
    async first<T>(sql: string, ...params: unknown[]) {
      return (raw.prepare(sql).get(...(params as never[])) as T) ?? null;
    },
    async all<T>(sql: string, ...params: unknown[]) {
      return raw.prepare(sql).all(...(params as never[])) as T[];
    },
  };
  return { db, raw };
}

export const owner = (id: string): OwnerRef => ({ type: "discord", id });

export function command(
  userId: string,
  name: string,
  options: { name: string; value: string | number }[] = []
): DiscordInteraction {
  return { type: 2, member: { user: { id: userId } }, data: { name, options } };
}

export const replyText = (reply: unknown): string => (reply as { data: { content: string } }).data.content;

// The address in a reply, pulled out of the code span it's wrapped in.
export const replyAddress = (reply: unknown): string => (replyText(reply).match(/`([^`]+)`/) ?? [])[1] ?? "";

export const migrationFile = (name: string) => readFileSync(repoFile(`migrations/${name}`), "utf8");
export const schemaSql = () => readFileSync(repoFile("schema.sql"), "utf8");
