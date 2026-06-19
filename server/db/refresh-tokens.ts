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
  input: IssueRefreshTokenInput
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
    ]
  );
}

export async function findActiveRefreshToken(
  tokenHash: string
): Promise<RefreshTokenRecord | null> {
  const pool = getPool();
  const [rows] = await pool.query<RefreshTokenRow[]>(
    `SELECT * FROM auth_refresh_tokens
      WHERE token_hash = ?
        AND revoked_at IS NULL
        AND expires_at > UTC_TIMESTAMP(3)
      LIMIT 1`,
    [tokenHash]
  );
  if (!rows.length) return null;
  const r = rows[0];
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
    [isoToDB(nowISO()), tokenHash]
  );
}

export async function revokeAllRefreshTokensForUser(
  userId: string
): Promise<void> {
  const pool = getPool();
  await pool.query(
    "UPDATE auth_refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL",
    [isoToDB(nowISO()), userId]
  );
}
