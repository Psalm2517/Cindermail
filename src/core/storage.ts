// The minimal, database-agnostic surface core/db.ts and core/ratelimit.ts run
// SQL against. D1 (Cloudflare Workers) and SQLite (self-hosted) both speak
// SQLite dialect already, so a single set of queries works against either —
// only this thin driver interface differs between them. All business logic
// (address generation, retry-on-collision, rate-limit windows) stays in core,
// unduplicated; implementations of this interface do nothing but run SQL.
export interface SqlExecutor {
  run(sql: string, ...params: unknown[]): Promise<{ changes: number }>;
  first<T>(sql: string, ...params: unknown[]): Promise<T | null>;
  all<T>(sql: string, ...params: unknown[]): Promise<T[]>;
}
