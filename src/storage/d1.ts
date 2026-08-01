import type { SqlExecutor } from "../core/storage.ts";

export function createD1Executor(db: D1Database): SqlExecutor {
  return {
    async run(sql, ...params) {
      const result = await db
        .prepare(sql)
        .bind(...params)
        .run();
      return { changes: result.meta.changes ?? 0 };
    },
    async first<T>(sql: string, ...params: unknown[]) {
      const row = await db
        .prepare(sql)
        .bind(...params)
        .first<T>();
      return row ?? null;
    },
    async all<T>(sql: string, ...params: unknown[]) {
      const result = await db
        .prepare(sql)
        .bind(...params)
        .all<T>();
      return result.results ?? [];
    },
  };
}
