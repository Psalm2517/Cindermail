import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import type { SqlExecutor } from "../core/storage.ts";

// D1 and SQLite both speak SQLite dialect, so schema.sql is shared verbatim
// between the two deployment targets. Every statement in it is
// CREATE-IF-NOT-EXISTS, so applying it on every startup (not just the first)
// picks up tables added by newer versions without a separate migration step.
export function openSqliteDatabase(path: string, schemaPath: string): Database.Database {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(readFileSync(schemaPath, "utf8"));
  return db;
}

export function createSqliteExecutor(db: Database.Database): SqlExecutor {
  return {
    async run(sql, ...params) {
      const result = db.prepare(sql).run(...(params as (string | number | bigint | null)[]));
      return { changes: result.changes };
    },
    async first<T>(sql: string, ...params: unknown[]) {
      const row = db.prepare(sql).get(...(params as (string | number | bigint | null)[]));
      return (row as T | undefined) ?? null;
    },
    async all<T>(sql: string, ...params: unknown[]) {
      return db.prepare(sql).all(...(params as (string | number | bigint | null)[])) as T[];
    },
  };
}
