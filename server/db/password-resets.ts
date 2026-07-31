import { isoToDB } from "./datetime";
import { generateId, nowISO } from "./ids";
import type { PasswordResetRow } from "./mappers";
import { getPool } from "./pool";

/**
 * Password-reset lifecycle. Token is opaque and only the hash is persisted —
 * same threat model as email verification and refresh tokens.
 */

export async function invalidatePendingPasswordResets(
  userId: string,
): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE auth_password_resets
        SET consumed_at = ?
      WHERE user_id = ?
        AND consumed_at IS NULL`,
    [isoToDB(nowISO()), userId],
  );
}

export async function createPasswordReset(input: {
  userId: string;
  tokenHash: string;
  expiresAt: string;
}): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO auth_password_resets
      (id, user_id, token_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [
      generateId("prst"),
      input.userId,
      input.tokenHash,
      isoToDB(input.expiresAt),
      isoToDB(nowISO()),
    ],
  );
}

/**
 * Marks the reset token consumed and returns the user id it was bound to.
 * Returns null if the token is unknown, already consumed, or expired.
 */
export async function consumePasswordReset(
  tokenHash: string,
): Promise<string | null> {
  const pool = getPool();
  const [rows] = await pool.query<PasswordResetRow[]>(
    `SELECT * FROM auth_password_resets
      WHERE token_hash = ?
        AND consumed_at IS NULL
        AND expires_at > UTC_TIMESTAMP(3)
      LIMIT 1`,
    [tokenHash],
  );
  const row = rows[0];
  if (!row) return null;
  await pool.query(
    "UPDATE auth_password_resets SET consumed_at = ? WHERE id = ?",
    [isoToDB(nowISO()), row.id],
  );
  return row.user_id;
}
