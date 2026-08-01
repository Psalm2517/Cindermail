import type { AddressRow, OwnerRef } from "./types";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const LOCAL_PART_LENGTH = 10;
const MAX_CREATE_ATTEMPTS = 5;

function randomLocalPart(): string {
  let out = "";
  for (let i = 0; i < LOCAL_PART_LENGTH; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
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
  const result = await db
    .prepare(
      `UPDATE addresses SET revoked = 1
       WHERE address = ? AND owner_type = ? AND owner_id = ? AND revoked = 0`
    )
    .bind(address, owner.type, owner.id)
    .run();
  return result.meta.changes > 0;
}

export async function deleteExpiredAndRevoked(db: D1Database, graceSeconds: number): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  const result = await db
    .prepare(
      `DELETE FROM addresses
       WHERE (revoked = 1 OR expires_at <= ?) AND (expires_at + ?) <= ?`
    )
    .bind(now, graceSeconds, now)
    .run();
  return result.meta.changes ?? 0;
}
