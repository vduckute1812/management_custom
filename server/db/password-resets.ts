import type { ResultSetHeader } from "mysql2/promise";
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
 * Cheap, non-authoritative check that a token is still redeemable.
 *
 * Exists purely so the handler can reject a bogus token before spending a
 * bcrypt hash (~100-300ms of blocking CPU at cost 12) on it. The authoritative
 * claim is still `redeemPasswordReset`, which re-checks the same predicate
 * atomically — so a token consumed between the two calls is caught there.
 */
export async function passwordResetIsRedeemable(
  tokenHash: string,
): Promise<boolean> {
  const pool = getPool();
  const [rows] = await pool.query<PasswordResetRow[]>(
    `SELECT user_id FROM auth_password_resets
      WHERE token_hash = ?
        AND consumed_at IS NULL
        AND expires_at > UTC_TIMESTAMP(3)
      LIMIT 1`,
    [tokenHash],
  );
  return rows.length > 0;
}

/**
 * Redeem a reset token: consume it, set the new password, and revoke every
 * refresh session — all in one transaction. Returns the user id, or null when
 * the token is unknown, already consumed, or expired.
 *
 * Two properties this buys, both previously missing:
 *
 * 1. The UPDATE carries the whole precondition and claims the row, so two
 *    concurrent requests cannot both redeem one token — exactly one sees
 *    `affectedRows === 1`. Reading first and updating afterwards let both
 *    through.
 * 2. The password change and the session revocation commit together. Split
 *    across two calls, a failure in between left the new password live while
 *    sessions opened with the old one kept working.
 *
 * `token_hash` is UNIQUE, so the follow-up read returns the row just claimed.
 */
export async function redeemPasswordReset(input: {
  tokenHash: string;
  passwordHash: string;
}): Promise<string | null> {
  const pool = getPool();
  const conn = await pool.getConnection();
  const now = isoToDB(nowISO());
  try {
    await conn.beginTransaction();

    const [claimed] = await conn.query<ResultSetHeader>(
      `UPDATE auth_password_resets
          SET consumed_at = ?
        WHERE token_hash = ?
          AND consumed_at IS NULL
          AND expires_at > UTC_TIMESTAMP(3)`,
      [now, input.tokenHash],
    );
    if (claimed.affectedRows !== 1) {
      await conn.rollback();
      return null;
    }

    const [rows] = await conn.query<PasswordResetRow[]>(
      "SELECT user_id FROM auth_password_resets WHERE token_hash = ? LIMIT 1",
      [input.tokenHash],
    );
    const userId = rows[0]?.user_id;
    if (!userId) {
      await conn.rollback();
      return null;
    }

    await conn.query(
      "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
      [input.passwordHash, now, userId],
    );
    await conn.query(
      "UPDATE auth_refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL",
      [now, userId],
    );

    await conn.commit();
    return userId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Drop consumed or expired password-reset rows. */
export async function purgeStalePasswordResets(): Promise<number> {
  const pool = getPool();
  const [result] = await pool.query<ResultSetHeader>(
    `DELETE FROM auth_password_resets
      WHERE consumed_at IS NOT NULL
         OR expires_at < UTC_TIMESTAMP(3)`,
  );
  return result.affectedRows ?? 0;
}
