import { DomainError } from "~/server/utils/http";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { isoToDB } from "./datetime";
import { generateId, nowISO } from "./ids";
import { avatarUrlFromUploadId, rowToUser, type UserRow } from "./mappers";
import { getPool } from "./pool";
import { UserRole, type UserRecord } from "./types";
import { UploadKind, type PostAuthor } from "../../types/post";
import {
  defaultMoneyCurrencyForLocale,
  isAppLocale,
  type AppLocale,
} from "../../types/locale";
import { isMoneyCurrency, type MoneyCurrency } from "../../types/money";
import { resolveDisplayName } from "../../utils/displayName";

// -------------------------------------------------------------------------
// Reads
// -------------------------------------------------------------------------

export async function getUserByEmail(
  email: string,
): Promise<UserRecord | null> {
  const pool = getPool();
  const [rows] = await pool.query<UserRow[]>(
    "SELECT * FROM users WHERE email = ? LIMIT 1",
    [email.toLowerCase()],
  );
  const row = rows[0];
  return row ? rowToUser(row) : null;
}

export async function getUserById(id: string): Promise<UserRecord | null> {
  const pool = getPool();
  const [rows] = await pool.query<UserRow[]>(
    "SELECT * FROM users WHERE id = ? LIMIT 1",
    [id],
  );
  const row = rows[0];
  return row ? rowToUser(row) : null;
}

export async function listUsers(): Promise<UserRecord[]> {
  const pool = getPool();
  const [rows] = await pool.query<UserRow[]>(
    "SELECT * FROM users ORDER BY created_at ASC",
  );
  return rows.map(rowToUser);
}

export async function countUsers(): Promise<number> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT COUNT(*) AS n FROM users",
  );
  return Number(rows[0]?.n ?? 0);
}

// -------------------------------------------------------------------------
// Writes
// -------------------------------------------------------------------------

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
// flag/hash together with the one-shot token they belong to. Standalone
// setters existed here and were the reason those flows were split across two
// connections.

export interface UpdateUserProfileInput {
  /** Pass `undefined` to leave unchanged. Empty/null is rejected (name required). */
  name?: string | null;
  /** Upload id owned by the user; empty/null clears the avatar. */
  avatarUploadId?: string | null;
  title?: string | null;
  job?: string | null;
  location?: string | null;
}

function normalizeOptionalText(
  value: string | null | undefined,
  max: number,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) {
    throw new DomainError(400, `Value must be ${max} characters or fewer`);
  }
  return trimmed;
}

/**
 * Partial profile update for the account owner. Returns the previous
 * `avatar_upload_id` when the avatar changes so callers can orphan-purge it.
 */
export async function updateUserProfile(
  id: string,
  input: UpdateUserProfileInput,
): Promise<{ user: UserRecord; previousAvatarUploadId: string | null }> {
  const pool = getPool();
  const [existingRows] = await pool.query<UserRow[]>(
    "SELECT * FROM users WHERE id = ? LIMIT 1",
    [id],
  );
  const existing = existingRows[0];
  if (!existing) {
    throw new DomainError(404, "User not found");
  }
  const previousAvatarUploadId = existing.avatar_upload_id ?? null;

  let name: string | undefined = undefined;
  if (input.name !== undefined) {
    const normalized = normalizeOptionalText(input.name, 120);
    // Display name is required — empty / null clears are rejected.
    if (normalized === null || normalized === undefined) {
      throw new DomainError(400, "Name is required");
    }
    name = normalized;
  }
  const title = normalizeOptionalText(input.title, 120);
  const job = normalizeOptionalText(input.job, 120);
  const location = normalizeOptionalText(input.location, 120);

  let avatarUploadId: string | null | undefined = undefined;
  if (input.avatarUploadId !== undefined) {
    if (input.avatarUploadId === null || !String(input.avatarUploadId).trim()) {
      avatarUploadId = null;
    } else {
      avatarUploadId = String(input.avatarUploadId).trim();
      const { getUploadById } = await import("./uploads");
      const upload = await getUploadById(avatarUploadId);
      if (!upload || upload.user_id !== id) {
        throw new DomainError(400, "Avatar upload is invalid");
      }
      if (upload.kind !== UploadKind.Image) {
        throw new DomainError(400, "Avatar must be an image");
      }
    }
  }

  const sets: string[] = [];
  const params: unknown[] = [];
  if (name !== undefined) {
    sets.push("name = ?");
    params.push(name);
  }
  if (avatarUploadId !== undefined) {
    sets.push("avatar_upload_id = ?");
    params.push(avatarUploadId);
  }
  if (title !== undefined) {
    sets.push("title = ?");
    params.push(title);
  }
  if (job !== undefined) {
    sets.push("job = ?");
    params.push(job);
  }
  if (location !== undefined) {
    sets.push("location = ?");
    params.push(location);
  }

  if (!sets.length) {
    return {
      user: rowToUser(existing),
      previousAvatarUploadId: null,
    };
  }

  sets.push("updated_at = ?");
  params.push(isoToDB(nowISO()));
  params.push(id);

  await pool.query(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`, params);

  const updated = await getUserById(id);
  if (!updated) {
    throw new Error("updateUserProfile: row vanished after update");
  }

  const avatarChanged =
    avatarUploadId !== undefined && avatarUploadId !== previousAvatarUploadId;

  return {
    user: updated,
    previousAvatarUploadId: avatarChanged ? previousAvatarUploadId : null,
  };
}

export interface UpdateUserPreferencesInput {
  locale?: AppLocale;
  moneyCurrency?: MoneyCurrency;
}

/**
 * Partial preference update (language + Money currency). Changing locale
 * does not rewrite currency — callers must pass moneyCurrency explicitly.
 */
export async function updateUserPreferences(
  id: string,
  input: UpdateUserPreferencesInput,
): Promise<UserRecord> {
  const pool = getPool();
  const sets: string[] = [];
  const params: unknown[] = [];

  if (input.locale !== undefined) {
    if (!isAppLocale(input.locale)) {
      throw new DomainError(400, "Unsupported locale");
    }
    sets.push("locale = ?");
    params.push(input.locale);
  }
  if (input.moneyCurrency !== undefined) {
    if (!isMoneyCurrency(input.moneyCurrency)) {
      throw new DomainError(400, "Unsupported currency");
    }
    sets.push("money_currency = ?");
    params.push(input.moneyCurrency);
  }

  if (!sets.length) {
    const existing = await getUserById(id);
    if (!existing) throw new DomainError(404, "User not found");
    return existing;
  }

  sets.push("updated_at = ?");
  params.push(isoToDB(nowISO()));
  params.push(id);

  const [result] = await pool.query<ResultSetHeader>(
    `UPDATE users SET ${sets.join(", ")} WHERE id = ?`,
    params,
  );
  if (result.affectedRows === 0) {
    throw new DomainError(404, "User not found");
  }

  const updated = await getUserById(id);
  if (!updated) {
    throw new Error("updateUserPreferences: row vanished after update");
  }
  return updated;
}

/**
 * Stamp `last_login_at` to "now". Called from POST /api/auth/login after a
 * successful credentials + email-verified check. Deliberately does NOT touch
 * `updated_at` — that field tracks profile / role / verification changes, not
 * sign-in activity, so the two signals stay independently inspectable.
 */
export async function recordUserLogin(id: string): Promise<void> {
  const pool = getPool();
  await pool.query("UPDATE users SET last_login_at = ? WHERE id = ?", [
    isoToDB(nowISO()),
    id,
  ]);
}

/**
 * Hard-delete a user row and every artefact that belongs to them.
 *
 * MySQL `ON DELETE CASCADE` removes owned rows (tasks, posts, chat, money,
 * uploads metadata, sessions, …). Extra work the FKs cannot do:
 *   - queue jobs whose payload targets their email (no `user_id` column)
 *   - Cloudflare R2 objects for their uploads and any legacy story keys
 *   - recount `posts.comment_count` on other people's posts they commented on
 *   - bust the anonymous public-feed cache so their posts stop appearing
 *
 * Share posts *by other users* that pointed at this user's originals keep
 * their row with `shared_post_id` SET NULL — those posts belong to the
 * sharer, not the deleted account.
 */
export async function deleteUser(id: string): Promise<boolean> {
  const { listStorageKeysForUser, purgeR2StorageKeys } =
    await import("./uploads");
  const { listStoryStorageKeysForUser } = await import("./stories");
  const { recountCommentCounts } = await import("./posts");
  const { deleteJobsForRecipientEmail } = await import("./jobs");
  const { invalidatePublicFeedCaches } =
    await import("~/server/utils/cacheInvalidate");

  const existing = await getUserById(id);
  if (!existing) return false;

  const uploadKeys = await listStorageKeysForUser(id);
  const storyKeys = await listStoryStorageKeysForUser(id);
  const keys = [...new Set([...uploadKeys, ...storyKeys])];

  const pool = getPool();
  const conn = await pool.getConnection();
  let ok = false;
  let touchedPostIds: string[] = [];
  try {
    await conn.beginTransaction();
    const [commentRows] = await conn.query<RowDataPacket[]>(
      "SELECT DISTINCT post_id AS postId FROM post_comments WHERE user_id = ?",
      [id],
    );
    touchedPostIds = commentRows
      .map((r) => String(r.postId ?? ""))
      .filter(Boolean);

    // Jobs reference the address, not the user id — delete them in the same
    // transaction so a crash between steps cannot leave mail still queued.
    await deleteJobsForRecipientEmail(existing.email, conn);

    const [result] = await conn.query<ResultSetHeader>(
      "DELETE FROM users WHERE id = ?",
      [id],
    );
    ok = (result.affectedRows ?? 0) > 0;
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  if (!ok) return false;

  if (touchedPostIds.length) {
    await recountCommentCounts(touchedPostIds);
  }
  if (keys.length) {
    await purgeR2StorageKeys(keys);
  }
  await invalidatePublicFeedCaches();
  return true;
}

export async function searchUserDirectory(
  viewerId: string,
  q: string,
  limit = 20,
): Promise<PostAuthor[]> {
  const pool = getPool();
  const term = `%${q.trim().toLowerCase()}%`;
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, name, email, avatar_upload_id FROM users
     WHERE id <> ?
       AND (
         LOWER(email) LIKE ?
         OR LOWER(COALESCE(name, '')) LIKE ?
       )
     ORDER BY name IS NULL, name ASC, email ASC
     LIMIT ?`,
    [viewerId, term, term, Math.min(Math.max(limit, 1), 20)],
  );
  return rows.map((r) => ({
    id: String(r.id),
    name: resolveDisplayName(
      (r.name as string | null) ?? null,
      String(r.email),
    ),
    email: String(r.email),
    avatarUrl:
      avatarUrlFromUploadId((r.avatar_upload_id as string | null) ?? null) ??
      null,
  }));
}

/** Resolve directory-style author cards for a set of user ids (edit forms). */
export async function getAuthorsByIds(
  userIds: string[],
): Promise<PostAuthor[]> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (!unique.length) return [];
  const pool = getPool();
  const placeholders = unique.map(() => "?").join(",");
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, name, email, avatar_upload_id, title, job, location
     FROM users
     WHERE id IN (${placeholders})`,
    unique,
  );
  const byId = new Map<string, PostAuthor>();
  for (const r of rows) {
    byId.set(String(r.id), {
      id: String(r.id),
      name: resolveDisplayName(
        (r.name as string | null) ?? null,
        String(r.email),
      ),
      email: String(r.email),
      avatarUrl:
        avatarUrlFromUploadId((r.avatar_upload_id as string | null) ?? null) ??
        null,
      title: (r.title as string | null) ?? null,
      job: (r.job as string | null) ?? null,
      location: (r.location as string | null) ?? null,
    });
  }
  return unique.flatMap((id) => {
    const author = byId.get(id);
    return author ? [author] : [];
  });
}
