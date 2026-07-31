import type { ResultSetHeader } from "mysql2/promise";
import { isoToDB } from "./datetime";
import { generateId, nowISO } from "./ids";
import type { EmailVerificationRow } from "./mappers";
import { getPool } from "./pool";

/**
 * Email-verification lifecycle. Token is opaque (32-byte hex) and only
 * the hash is persisted — same threat model as refresh tokens.
 */

export async function createEmailVerification(input: {
  userId: string;
  tokenHash: string;
  expiresAt: string;
}): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO auth_email_verifications
      (id, user_id, token_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [
      generateId("vrfy"),
      input.userId,
      input.tokenHash,
      isoToDB(input.expiresAt),
      isoToDB(nowISO()),
    ],
  );
}

/**
 * Redeem a verification token: consume it and flip `email_verified`, in one
 * transaction. Returns the user id, or null when the token is unknown,
 * already consumed, or expired.
 *
 * Claimed with a single guarded UPDATE for the same reason as
 * `redeemPasswordReset`: a read-then-write pair lets two concurrent requests
 * both consume one token. Committing the flag with the consumption also
 * removes the window where a crash burned the one-shot token without
 * verifying the account — signup does not re-send, so that needed manual
 * repair.
 */
export async function redeemEmailVerification(
  tokenHash: string,
): Promise<string | null> {
  const pool = getPool();
  const conn = await pool.getConnection();
  const now = isoToDB(nowISO());
  try {
    await conn.beginTransaction();

    const [claimed] = await conn.query<ResultSetHeader>(
      `UPDATE auth_email_verifications
          SET consumed_at = ?
        WHERE token_hash = ?
          AND consumed_at IS NULL
          AND expires_at > UTC_TIMESTAMP(3)`,
      [now, tokenHash],
    );
    if (claimed.affectedRows !== 1) {
      await conn.rollback();
      return null;
    }

    const [rows] = await conn.query<EmailVerificationRow[]>(
      "SELECT user_id FROM auth_email_verifications WHERE token_hash = ? LIMIT 1",
      [tokenHash],
    );
    const userId = rows[0]?.user_id;
    if (!userId) {
      await conn.rollback();
      return null;
    }

    await conn.query(
      "UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?",
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

/** Drop consumed or expired verification rows. */
export async function purgeStaleEmailVerifications(): Promise<number> {
  const pool = getPool();
  const [result] = await pool.query<ResultSetHeader>(
    `DELETE FROM auth_email_verifications
      WHERE consumed_at IS NOT NULL
         OR expires_at < UTC_TIMESTAMP(3)`,
  );
  return result.affectedRows ?? 0;
}
