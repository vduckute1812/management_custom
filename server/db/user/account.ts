import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import {
  defaultMoneyCurrencyForLocale,
  isAppLocale,
  type AppLocale,
} from "../../../types/locale";
import { isMoneyCurrency, type MoneyCurrency } from "../../../types/money";
import { resolveDisplayName } from "../../../utils/displayName";
import { isoToDB } from "../datetime";
import { generateId, nowISO } from "../ids";
import { getPool } from "../pool";
import { UserRole, type UserRecord } from "../types";
import { getUserById } from "./queries";

export interface CreateUserInput {
  email: string;
  /** Null for OAuth-only accounts. */
  passwordHash: string | null;
  /** Display name; when omitted, derived from the email local-part. */
  name?: string;
  role?: UserRole;
  emailVerified?: boolean;
  /** Preferred UI / email language. Defaults to `en`. */
  locale?: AppLocale;
  /**
   * Money display currency. Defaults from `locale` when omitted.
   * Pass explicitly only when the caller already chose a currency.
   */
  moneyCurrency?: MoneyCurrency;
}

function resolveCreatePrefs(input: CreateUserInput): {
  locale: AppLocale;
  moneyCurrency: MoneyCurrency;
  name: string;
} {
  const locale = isAppLocale(input.locale) ? input.locale : "en";
  const moneyCurrency =
    input.moneyCurrency !== undefined && isMoneyCurrency(input.moneyCurrency)
      ? input.moneyCurrency
      : defaultMoneyCurrencyForLocale(locale);
  const name = resolveDisplayName(input.name, input.email);
  return { locale, moneyCurrency, name };
}

export async function createUser(input: CreateUserInput): Promise<UserRecord> {
  const pool = getPool();
  const id = generateId("user");
  const now = nowISO();
  const role = input.role ?? UserRole.Normal;
  const verified = input.emailVerified ? 1 : 0;
  const { locale, moneyCurrency, name } = resolveCreatePrefs(input);
  await pool.query(
    `INSERT INTO users
      (id, email, password_hash, name, role, email_verified, locale, money_currency, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.email.toLowerCase(),
      input.passwordHash,
      name,
      role,
      verified,
      locale,
      moneyCurrency,
      isoToDB(now),
      isoToDB(now),
    ],
  );
  const created = await getUserById(id);
  if (!created) {
    throw new Error("createUser: row vanished immediately after insert");
  }
  return created;
}

/**
 * Creates the user row and its email-verification token in one transaction so
 * a mid-flight failure cannot leave an unverifiable orphan account that blocks
 * a later signup with the same email.
 */
export async function createUserWithEmailVerification(input: {
  user: CreateUserInput;
  tokenHash: string;
  expiresAt: string;
}): Promise<UserRecord> {
  const pool = getPool();
  const conn = await pool.getConnection();
  const id = generateId("user");
  const now = nowISO();
  const role = input.user.role ?? UserRole.Normal;
  const verified = input.user.emailVerified ? 1 : 0;
  const { locale, moneyCurrency, name } = resolveCreatePrefs(input.user);
  try {
    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO users
        (id, email, password_hash, name, role, email_verified, locale, money_currency, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.user.email.toLowerCase(),
        input.user.passwordHash,
        name,
        role,
        verified,
        locale,
        moneyCurrency,
        isoToDB(now),
        isoToDB(now),
      ],
    );
    await conn.query(
      `INSERT INTO auth_email_verifications
        (id, user_id, token_hash, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        generateId("vrfy"),
        id,
        input.tokenHash,
        isoToDB(input.expiresAt),
        isoToDB(now),
      ],
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  const created = await getUserById(id);
  if (!created) {
    throw new Error(
      "createUserWithEmailVerification: row vanished after commit",
    );
  }
  return created;
}

export async function updateUserRole(
  id: string,
  role: UserRole,
): Promise<void> {
  const pool = getPool();
  await pool.query("UPDATE users SET role = ?, updated_at = ? WHERE id = ?", [
    role,
    isoToDB(nowISO()),
    id,
  ]);
}

/** Mark email verified after a trusted IdP (e.g. Google) confirmed it. */
export async function markUserEmailVerified(id: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    "UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ? AND email_verified = 0",
    [isoToDB(nowISO()), id],
  );
}

// `email_verified` and `password_hash` are written inside the transactions in
// server/db/{email-verifications,password-resets}.ts, which must commit the
// flag/hash together with the one-shot token they belong to.

/**
 * Stamp `last_login_at` to "now" without changing profile `updated_at`.
 */
export async function recordUserLogin(id: string): Promise<void> {
  const pool = getPool();
  await pool.query("UPDATE users SET last_login_at = ? WHERE id = ?", [
    isoToDB(nowISO()),
    id,
  ]);
}

/**
 * Atomically delete the user row and address-only queued jobs. Cascading
 * foreign keys remove owned database records; external cleanup is orchestrated
 * by accountDeletionService.
 */
export async function deleteUserRecord(
  id: string,
  recipientEmail: string,
): Promise<{ removed: boolean; touchedPostIds: string[] }> {
  const { deleteJobsForRecipientEmail } = await import("../jobs");
  const pool = getPool();
  const conn = await pool.getConnection();
  let removed: boolean;
  let touchedPostIds: string[];
  try {
    await conn.beginTransaction();
    const [commentRows] = await conn.query<RowDataPacket[]>(
      "SELECT DISTINCT post_id AS postId FROM post_comments WHERE user_id = ?",
      [id],
    );
    touchedPostIds = commentRows
      .map((row) => String(row.postId ?? ""))
      .filter(Boolean);

    await deleteJobsForRecipientEmail(recipientEmail, conn);

    const [result] = await conn.query<ResultSetHeader>(
      "DELETE FROM users WHERE id = ?",
      [id],
    );
    removed = (result.affectedRows ?? 0) > 0;
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  return { removed, touchedPostIds };
}
