import type { SqlExecutor } from "./storage.ts";
import type { AddressRow, OwnerRef } from "./types.ts";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const LOCAL_PART_LENGTH = 10;
const MAX_CREATE_ATTEMPTS = 5;

// Addresses must not be predictable: users can mint addresses and see the
// results, and Math.random()'s PRNG state is recoverable from observed
// output, which would let one user guess another's addresses. Uses rejection
// sampling: bytes at or above the largest multiple of the alphabet length
// are discarded rather than folded in with %, which would bias the low
// characters of the alphabet.
const REJECTION_LIMIT = 256 - (256 % ALPHABET.length);

// Exported since other receivers (mail.tm) need their own random strings
// (a local part, an account password) with the same guarantee.
export function randomAlphanumeric(length: number): string {
  let out = "";
  while (out.length < length) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte >= REJECTION_LIMIT) {
        continue;
      }
      out += ALPHABET[byte % ALPHABET.length];
      if (out.length === length) {
        break;
      }
    }
  }
  return out;
}

export async function createAddress(
  db: SqlExecutor,
  owner: OwnerRef,
  domain: string,
  ttlSeconds: number,
  permanent = false
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + ttlSeconds;

  for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt++) {
    const address = `${randomAlphanumeric(LOCAL_PART_LENGTH)}@${domain}`;
    const result = await db.run(
      `INSERT INTO addresses (address, owner_type, owner_id, created_at, expires_at, revoked, permanent)
       VALUES (?, ?, ?, ?, ?, 0, ?)
       ON CONFLICT(address) DO NOTHING`,
      address,
      owner.type,
      owner.id,
      now,
      expiresAt,
      permanent ? 1 : 0
    );

    if (result.changes > 0) {
      await incrementCreatedCounter(db);
      return address;
    }
  }

  throw new Error("failed to allocate a unique address after several attempts");
}

// For receivers that provision the address themselves (mail.tm calls their
// API and gets an address back, rather than inventing a local part on a
// domain we own) and just need it persisted. receiverData is opaque to core,
// see schema.sql for what it's for.
export async function registerAddress(
  db: SqlExecutor,
  address: string,
  owner: OwnerRef,
  ttlSeconds: number,
  receiverData: string,
  permanent = false
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + ttlSeconds;
  await db.run(
    `INSERT INTO addresses (address, owner_type, owner_id, created_at, expires_at, revoked, permanent, receiver_data)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
    address,
    owner.type,
    owner.id,
    now,
    expiresAt,
    permanent ? 1 : 0,
    receiverData
  );
  await incrementCreatedCounter(db);
}

export async function getAddress(db: SqlExecutor, address: string): Promise<AddressRow | null> {
  return db.first<AddressRow>(`SELECT * FROM addresses WHERE address = ?`, address);
}

export async function listActiveAddresses(db: SqlExecutor, owner: OwnerRef): Promise<AddressRow[]> {
  const now = Math.floor(Date.now() / 1000);
  return db.all<AddressRow>(
    `SELECT * FROM addresses
     WHERE owner_type = ? AND owner_id = ? AND revoked = 0 AND (permanent = 1 OR expires_at > ?)
     ORDER BY permanent ASC, expires_at ASC`,
    owner.type,
    owner.id,
    now
  );
}

// Every active address that has receiver-specific data attached, regardless
// of which receiver set it. Used by a receiver's own poller/cleanup to find
// the rows it's responsible for; core has no idea what's inside the column,
// callers filter by whatever shape they expect.
export async function listActiveAddressesWithReceiverData(db: SqlExecutor): Promise<AddressRow[]> {
  const now = Math.floor(Date.now() / 1000);
  return db.all<AddressRow>(
    `SELECT * FROM addresses
     WHERE receiver_data IS NOT NULL AND revoked = 0 AND (permanent = 1 OR expires_at > ?)`,
    now
  );
}

// Same rows deleteExpiredAndRevoked would remove, but as a read. A receiver
// that needs to clean up external state (mail.tm deleting the account on
// its side) has to know which rows are about to go before they're gone.
export async function listExpiredAndRevoked(db: SqlExecutor, graceSeconds: number): Promise<AddressRow[]> {
  const now = Math.floor(Date.now() / 1000);
  return db.all<AddressRow>(
    `SELECT * FROM addresses
     WHERE (revoked = 1 AND COALESCE(revoked_at, expires_at) + ? <= ?)
        OR (permanent = 0 AND expires_at + ? <= ?)`,
    graceSeconds,
    now,
    graceSeconds,
    now
  );
}

export async function countActiveAddresses(db: SqlExecutor, owner: OwnerRef): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  const row = await db.first<{ count: number }>(
    `SELECT COUNT(*) as count FROM addresses
     WHERE owner_type = ? AND owner_id = ? AND revoked = 0 AND (permanent = 1 OR expires_at > ?)`,
    owner.type,
    owner.id,
    now
  );
  return row?.count ?? 0;
}

// expires_at is always pushed out, even when making an address permanent, so
// that clearing the flag later leaves a fresh expiry rather than one that
// lapsed while the address was permanent. `permanent` undefined leaves the
// flag as it is, which is what a plain /extend does.
export async function extendAddress(
  db: SqlExecutor,
  owner: OwnerRef,
  address: string,
  ttlSeconds: number,
  permanent?: boolean
): Promise<boolean> {
  const newExpiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const setPermanent = permanent === undefined ? "" : `, permanent = ${permanent ? 1 : 0}`;
  const result = await db.run(
    `UPDATE addresses SET expires_at = ?${setPermanent}
     WHERE address = ? AND owner_type = ? AND owner_id = ? AND revoked = 0`,
    newExpiresAt,
    address,
    owner.type,
    owner.id
  );
  return result.changes > 0;
}

export async function revokeAddress(db: SqlExecutor, owner: OwnerRef, address: string): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const result = await db.run(
    `UPDATE addresses SET revoked = 1, revoked_at = ?
     WHERE address = ? AND owner_type = ? AND owner_id = ? AND revoked = 0`,
    now,
    address,
    owner.type,
    owner.id
  );
  if (result.changes > 0) {
    await incrementTorchedCounter(db);
  }
  return result.changes > 0;
}

// Expired rows are removed once they are `graceSeconds` past expiry; revoked
// rows once they are `graceSeconds` past the moment they were revoked, rather
// than waiting out their original (possibly week-long) expiry. Rows revoked
// before revoked_at existed have no timestamp, so they fall back to expiry.
// Permanent rows never expire, so only the revoked branch can ever collect
// them: torching one is still the way it goes away.
export async function deleteExpiredAndRevoked(db: SqlExecutor, graceSeconds: number): Promise<number> {
  const now = Math.floor(Date.now() / 1000);
  const result = await db.run(
    `DELETE FROM addresses
     WHERE (revoked = 1 AND COALESCE(revoked_at, expires_at) + ? <= ?)
        OR (permanent = 0 AND expires_at + ? <= ?)`,
    graceSeconds,
    now,
    graceSeconds,
    now
  );
  return result.changes;
}

// Rate-limit rows are keyed by (owner, action) so the table is bounded by
// user count rather than traffic, but rows for users who stop using the bot
// would otherwise persist forever. Anything whose window closed long ago is
// inert. Dropping it is equivalent to the row never having existed.
export async function deleteStaleRateLimits(db: SqlExecutor, olderThanSeconds: number): Promise<number> {
  const cutoff = Math.floor(Date.now() / 1000) - olderThanSeconds;
  const result = await db.run(`DELETE FROM rate_limits WHERE window_start <= ?`, cutoff);
  return result.changes;
}

// Running totals for the public counter page. Not wrapped in the same
// transaction as the insert/revoke they follow -- SqlExecutor has no
// multi-statement transaction primitive -- so a crash between the two
// statements could undercount by one in a rare edge case. Fine for a vanity
// counter, not worth adding transaction plumbing for.
async function incrementCreatedCounter(db: SqlExecutor): Promise<void> {
  await db.run(`UPDATE counters SET created = created + 1 WHERE id = 1`);
}

async function incrementTorchedCounter(db: SqlExecutor): Promise<void> {
  await db.run(`UPDATE counters SET torched = torched + 1 WHERE id = 1`);
}

export async function incrementReceivedCounter(db: SqlExecutor): Promise<void> {
  await db.run(`UPDATE counters SET received = received + 1 WHERE id = 1`);
}

export interface Counters {
  created: number;
  torched: number;
  received: number;
}

export async function getCounters(db: SqlExecutor): Promise<Counters> {
  const row = await db.first<Counters>(`SELECT created, torched, received FROM counters WHERE id = 1`);
  return row ?? { created: 0, torched: 0, received: 0 };
}
