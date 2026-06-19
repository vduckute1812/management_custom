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
    ]
  );
}

/**
 * Marks the verification consumed and returns the user id it was bound
 * to. Returns null if the token is unknown, already consumed, or expired.
 */
export async function consumeEmailVerification(
  tokenHash: string
): Promise<string | null> {
  const pool = getPool();
  const [rows] = await pool.query<EmailVerificationRow[]>(
    `SELECT * FROM auth_email_verifications
      WHERE token_hash = ?
        AND consumed_at IS NULL
        AND expires_at > UTC_TIMESTAMP(3)
      LIMIT 1`,
    [tokenHash]
  );
  if (!rows.length) return null;
  const row = rows[0];
  await pool.query(
    "UPDATE auth_email_verifications SET consumed_at = ? WHERE id = ?",
    [isoToDB(nowISO()), row.id]
  );
  return row.user_id;
}
