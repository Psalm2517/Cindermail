import type { AddressRow, OwnerRef } from "./types";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const LOCAL_PART_LENGTH = 10;
const MAX_CREATE_ATTEMPTS = 5;

// Addresses must not be predictable: users can mint addresses and see the
// results, and Math.random()'s PRNG state is recoverable from observed
// output, which would let one user guess another's addresses. Uses rejection
// sampling — bytes at or above the largest multiple of the alphabet length
// are discarded rather than folded in with %, which would bias the low
// characters of the alphabet.
const REJECTION_LIMIT = 256 - (256 % ALPHABET.length);

function randomLocalPart(): string {
  let out = "";
  while (out.length < LOCAL_PART_LENGTH) {
    const bytes = new Uint8Array(LOCAL_PART_LENGTH);
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte >= REJECTION_LIMIT) {
        continue;
      }
      out += ALPHABET[byte % ALPHABET.length];
      if (out.length === LOCAL_PART_LENGTH) {
        break;
      }
    }
  }
  return out;
}

export async function createAddress(
  db: D1Database,
  owner: OwnerRef,
  domain: string,
  ttlSeconds: number
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + ttlSeconds;

  for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt++) {
    const address = `${randomLocalPart()}@${domain}`;
    const result = await db
      .prepare(
        `INSERT INTO addresses (address, owner_type, owner_id, created_at, expires_at, revoked)
         VALUES (?, ?, ?, ?, ?, 0)
         ON CONFLICT(address) DO NOTHING`
      )
      .bind(address, owner.type, owner.id, now, expiresAt)
      .run();

    if (result.meta.changes > 0) {
      return address;
    }
  }

  throw new Error("failed to allocate a unique address after several attempts");
}

export async function getAddress(db: D1Database, address: string): Promise<AddressRow | null> {
  const row = await db
    .prepare(`SELECT * FROM addresses WHERE address = ?`)
    .bind(address)
    .first<AddressRow>();
  return row ?? null;
}

export async function listActiveAddresses(db: D1Database, owner: OwnerRef): Promise<AddressRow[]> {
  const now = Math.floor(Date.now() / 1000);
  const result = await db
    .prepare(
      `SELECT * FROM addresses
       WHERE owner_type = ? AND owner_id = ? AND revoked = 0 AND expires_at > ?
       ORDER BY expires_at ASC`
    )
    .bind(owner.type, owner.id, now)
    .all<AddressRow>();
  return result.results ?? [];
}

export async function countActiveAddresses(db: D1Database, owner: OwnerRef): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  const row = await db
    .prepare(
      `SELECT COUNT(*) as count FROM addresses
       WHERE owner_type = ? AND owner_id = ? AND revoked = 0 AND expires_at > ?`
    )
    .bind(owner.type, owner.id, now)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export async function extendAddress(
  db: D1Database,
  owner: OwnerRef,
  address: string,
  ttlSeconds: number
): Promise<boolean> {
  const newExpiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const result = await db
    .prepare(
      `UPDATE addresses SET expires_at = ?
       WHERE address = ? AND owner_type = ? AND owner_id = ? AND revoked = 0`
    )
    .bind(newExpiresAt, address, owner.type, owner.id)
    .run();
  return result.meta.changes > 0;
}

export async function revokeAddress(db: D1Database, owner: OwnerRef, address: string): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const result = await db
    .prepare(
      `UPDATE addresses SET revoked = 1, revoked_at = ?
       WHERE address = ? AND owner_type = ? AND owner_id = ? AND revoked = 0`
    )
    .bind(now, address, owner.type, owner.id)
    .run();
  return result.meta.changes > 0;
}

// Expired rows are removed once they are `graceSeconds` past expiry; revoked
// rows once they are `graceSeconds` past the moment they were revoked, rather
// than waiting out their original (possibly week-long) expiry. Rows revoked
// before revoked_at existed have no timestamp, so they fall back to expiry.
export async function deleteExpiredAndRevoked(db: D1Database, graceSeconds: number): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  const result = await db
    .prepare(
      `DELETE FROM addresses
       WHERE (revoked = 1 AND COALESCE(revoked_at, expires_at) + ? <= ?)
          OR (expires_at + ? <= ?)`
    )
    .bind(graceSeconds, now, graceSeconds, now)
    .run();
  return result.meta.changes ?? 0;
}

// Rate-limit rows are keyed by (owner, action) so the table is bounded by
// user count rather than traffic, but rows for users who stop using the bot
// would otherwise persist forever. Anything whose window closed long ago is
// inert — dropping it is equivalent to the row never having existed.
export async function deleteStaleRateLimits(db: D1Database, olderThanSeconds: number): Promise<number> {
  const cutoff = Math.floor(Date.now() / 1000) - olderThanSeconds;
  const result = await db
    .prepare(`DELETE FROM rate_limits WHERE window_start <= ?`)
    .bind(cutoff)
    .run();
  return result.meta.changes ?? 0;
}
