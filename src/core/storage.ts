// The minimal, database-agnostic surface core/db.ts and core/ratelimit.ts run
// SQL against. Keeping D1's types out of core is what lets the tests run the
// same queries against a real SQLite database, which speaks the same dialect.
// All business logic (address generation, retry-on-collision, rate-limit
// windows) stays in core; implementations of this interface only run SQL.
export interface SqlExecutor {
  run(sql: string, ...params: unknown[]): Promise<{ changes: number }>;
  first<T>(sql: string, ...params: unknown[]): Promise<T | null>;
  all<T>(sql: string, ...params: unknown[]): Promise<T[]>;
}
