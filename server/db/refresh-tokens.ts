import type { ResultSetHeader } from "mysql2/promise";
import { dbToISO, isoToDB } from "./datetime";
import { generateId, nowISO } from "./ids";
import type { RefreshTokenRow } from "./mappers";
import { getPool } from "./pool";
import type { RefreshTokenRecord } from "./types";

/**
 * Refresh-token lifecycle for `/api/auth/{login,refresh,logout}`.
 * The token itself is opaque (random 32-byte hex); only the SHA-256 hash
 * is persisted so a DB dump can't be replayed as a session.
 */

export interface IssueRefreshTokenInput {
  userId: string;
  tokenHash: string;
  expiresAt: string;
  userAgent?: string;
  ip?: string;
}

export async function issueRefreshToken(
  input: IssueRefreshTokenInput,
): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO auth_refresh_tokens
      (id, user_id, token_hash, expires_at, user_agent, ip, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      generateId("rtok"),
      input.userId,
      input.tokenHash,
      isoToDB(input.expiresAt),
      input.userAgent ?? null,
      input.ip ?? null,
      isoToDB(nowISO()),
    ],
  );
}

export async function findActiveRefreshToken(
  tokenHash: string,
): Promise<RefreshTokenRecord | null> {
  const pool = getPool();
  const [rows] = await pool.query<RefreshTokenRow[]>(
    `SELECT * FROM auth_refresh_tokens
      WHERE token_hash = ?
        AND revoked_at IS NULL
        AND expires_at > UTC_TIMESTAMP(3)
      LIMIT 1`,
    [tokenHash],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    userId: r.user_id,
    tokenHash: r.token_hash,
    expiresAt: dbToISO(r.expires_at),
    revokedAt: r.revoked_at ? dbToISO(r.revoked_at) : undefined,
    userAgent: r.user_agent ?? undefined,
    ip: r.ip ?? undefined,
    createdAt: dbToISO(r.created_at),
  };
}

export async function revokeRefreshToken(tokenHash: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    "UPDATE auth_refresh_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL",
    [isoToDB(nowISO()), tokenHash],
  );
}

/**
 * Atomically revoke the presented refresh hash and insert its successor in
 * one transaction. Returns false when the presented token was already
 * revoked/expired (concurrent refresh lost the race) so the caller can 401
 * without issuing a second live session.
 */
export async function rotateRefreshToken(input: {
  presentedHash: string;
  next: IssueRefreshTokenInput;
}): Promise<boolean> {
  const pool = getPool();
  const conn = await pool.getConnection();
  const revokedAt = isoToDB(nowISO());
  try {
    await conn.beginTransaction();
    const [result] = await conn.query<ResultSetHeader>(
      `UPDATE auth_refresh_tokens
          SET revoked_at = ?
        WHERE token_hash = ?
          AND revoked_at IS NULL
          AND expires_at > UTC_TIMESTAMP(3)`,
      [revokedAt, input.presentedHash],
    );
    if (result.affectedRows !== 1) {
      await conn.rollback();
      return false;
    }
    await conn.query(
      `INSERT INTO auth_refresh_tokens
        (id, user_id, token_hash, expires_at, user_agent, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        generateId("rtok"),
        input.next.userId,
        input.next.tokenHash,
        isoToDB(input.next.expiresAt),
        input.next.userAgent ?? null,
        input.next.ip ?? null,
        revokedAt,
      ],
    );
    await conn.commit();
    return true;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function revokeAllRefreshTokensForUser(
  userId: string,
): Promise<void> {
  const pool = getPool();
  await pool.query(
    "UPDATE auth_refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL",
    [isoToDB(nowISO()), userId],
  );
}

/**
 * Drop expired and long-revoked refresh tokens. Rotation never deletes rows,
 * so without a purge this is the fastest-growing table in the system.
 */
export async function purgeExpiredRefreshTokens(
  revokedOlderThanDays = 30,
): Promise<number> {
  const pool = getPool();
  const revokedCutoff = new Date(
    Date.now() - revokedOlderThanDays * 24 * 3600 * 1000,
  ).toISOString();
  const [result] = await pool.query<ResultSetHeader>(
    `DELETE FROM auth_refresh_tokens
      WHERE expires_at < UTC_TIMESTAMP(3)
         OR (revoked_at IS NOT NULL AND revoked_at < ?)`,
    [isoToDB(revokedCutoff)],
  );
  return result.affectedRows ?? 0;
}
