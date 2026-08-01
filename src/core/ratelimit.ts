import type { SqlExecutor } from "./storage.ts";

export async function checkAndIncrement(
  db: SqlExecutor,
  ownerType: string,
  ownerId: string,
  action: string,
  windowSeconds: number,
  maxCount: number
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);

  const existing = await db.first<{ window_start: number; count: number }>(
    `SELECT window_start, count FROM rate_limits WHERE owner_type = ? AND owner_id = ? AND action = ?`,
    ownerType,
    ownerId,
    action
  );

  if (!existing || now - existing.window_start > windowSeconds) {
    await db.run(
      `INSERT INTO rate_limits (owner_type, owner_id, action, window_start, count)
       VALUES (?, ?, ?, ?, 1)
       ON CONFLICT(owner_type, owner_id, action)
       DO UPDATE SET window_start = excluded.window_start, count = 1`,
      ownerType,
      ownerId,
      action,
      now
    );
    return true;
  }

  if (existing.count >= maxCount) {
    return false;
  }

  await db.run(
    `UPDATE rate_limits SET count = count + 1 WHERE owner_type = ? AND owner_id = ? AND action = ?`,
    ownerType,
    ownerId,
    action
  );
  return true;
}
