import type { RowDataPacket } from "mysql2/promise";
import { isoToDB } from "./datetime";
import { generateId, nowISO } from "./ids";
import { rowToUser, type UserRow } from "./mappers";
import { getPool } from "./pool";
import { UserRole, type UserRecord } from "./types";
import { UploadKind } from "../../types/post";

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
  return rows.length ? rowToUser(rows[0]) : null;
}

export async function getUserById(id: string): Promise<UserRecord | null> {
  const pool = getPool();
  const [rows] = await pool.query<UserRow[]>(
    "SELECT * FROM users WHERE id = ? LIMIT 1",
    [id],
  );
  return rows.length ? rowToUser(rows[0]) : null;
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
  passwordHash: string;
  name?: string;
  role?: UserRole;
  emailVerified?: boolean;
}

export async function createUser(input: CreateUserInput): Promise<UserRecord> {
  const pool = getPool();
  const id = generateId("user");
  const now = nowISO();
  const role = input.role ?? UserRole.Normal;
  const verified = input.emailVerified ? 1 : 0;
  await pool.query(
    `INSERT INTO users
      (id, email, password_hash, name, role, email_verified, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.email.toLowerCase(),
      input.passwordHash,
      input.name ?? null,
      role,
      verified,
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
  try {
    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO users
        (id, email, password_hash, name, role, email_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.user.email.toLowerCase(),
        input.user.passwordHash,
        input.user.name ?? null,
        role,
        verified,
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

export async function setEmailVerified(
  id: string,
  verified: boolean,
): Promise<void> {
  const pool = getPool();
  await pool.query(
    "UPDATE users SET email_verified = ?, updated_at = ? WHERE id = ?",
    [verified ? 1 : 0, isoToDB(nowISO()), id],
  );
}

export async function updateUserPassword(
  id: string,
  passwordHash: string,
): Promise<void> {
  const pool = getPool();
  await pool.query(
    "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
    [passwordHash, isoToDB(nowISO()), id],
  );
}

export interface UpdateUserProfileInput {
  /** Pass `undefined` to leave unchanged; empty/null clears. */
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
    throw Object.assign(new Error(`Value must be ${max} characters or fewer`), {
      statusCode: 400,
    });
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
  if (!existingRows.length) {
    throw Object.assign(new Error("User not found"), { statusCode: 404 });
  }
  const existing = existingRows[0];
  const previousAvatarUploadId = existing.avatar_upload_id ?? null;

  const name = normalizeOptionalText(input.name, 120);
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
        throw Object.assign(new Error("Avatar upload is invalid"), {
          statusCode: 400,
        });
      }
      if (upload.kind !== UploadKind.Image) {
        throw Object.assign(new Error("Avatar must be an image"), {
          statusCode: 400,
        });
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
 * Hard-delete a user row. Related MySQL data cascades via FK constraints.
 * Cloudflare R2 objects for the user's uploads are deleted afterwards
 * (CASCADE cannot touch object storage).
 */
export async function deleteUser(id: string): Promise<boolean> {
  const { listStorageKeysForUser, purgeR2StorageKeys } =
    await import("./uploads");
  const keys = await listStorageKeysForUser(id);

  const pool = getPool();
  const [result] = await pool.query("DELETE FROM users WHERE id = ?", [id]);
  const ok = ((result as { affectedRows?: number }).affectedRows ?? 0) > 0;
  if (ok && keys.length) {
    await purgeR2StorageKeys(keys);
  }
  return ok;
}
