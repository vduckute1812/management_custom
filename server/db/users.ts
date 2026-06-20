import type { RowDataPacket } from "mysql2/promise";
import { isoToDB } from "./datetime";
import { generateId, nowISO } from "./ids";
import { rowToUser, type UserRow } from "./mappers";
import { getPool } from "./pool";
import { UserRole, type UserRecord } from "./types";

// -------------------------------------------------------------------------
// Reads
// -------------------------------------------------------------------------

export async function getUserByEmail(
  email: string
): Promise<UserRecord | null> {
  const pool = getPool();
  const [rows] = await pool.query<UserRow[]>(
    "SELECT * FROM users WHERE email = ? LIMIT 1",
    [email.toLowerCase()]
  );
  return rows.length ? rowToUser(rows[0]) : null;
}

export async function getUserById(id: string): Promise<UserRecord | null> {
  const pool = getPool();
  const [rows] = await pool.query<UserRow[]>(
    "SELECT * FROM users WHERE id = ? LIMIT 1",
    [id]
  );
  return rows.length ? rowToUser(rows[0]) : null;
}

export async function listUsers(): Promise<UserRecord[]> {
  const pool = getPool();
  const [rows] = await pool.query<UserRow[]>(
    "SELECT * FROM users ORDER BY created_at ASC"
  );
  return rows.map(rowToUser);
}

export async function countUsers(): Promise<number> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT COUNT(*) AS n FROM users"
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
    ]
  );
  const created = await getUserById(id);
  if (!created) {
    throw new Error("createUser: row vanished immediately after insert");
  }
  return created;
}

export async function updateUserRole(
  id: string,
  role: UserRole
): Promise<void> {
  const pool = getPool();
  await pool.query(
    "UPDATE users SET role = ?, updated_at = ? WHERE id = ?",
    [role, isoToDB(nowISO()), id]
  );
}

export async function setEmailVerified(
  id: string,
  verified: boolean
): Promise<void> {
  const pool = getPool();
  await pool.query(
    "UPDATE users SET email_verified = ?, updated_at = ? WHERE id = ?",
    [verified ? 1 : 0, isoToDB(nowISO()), id]
  );
}

export async function updateUserPassword(
  id: string,
  passwordHash: string
): Promise<void> {
  const pool = getPool();
  await pool.query(
    "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
    [passwordHash, isoToDB(nowISO()), id]
  );
}

/**
 * Stamp `last_login_at` to "now". Called from POST /api/auth/login after a
 * successful credentials + email-verified check. Deliberately does NOT touch
 * `updated_at` — that field tracks profile / role / verification changes, not
 * sign-in activity, so the two signals stay independently inspectable.
 */
export async function recordUserLogin(id: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    "UPDATE users SET last_login_at = ? WHERE id = ?",
    [isoToDB(nowISO()), id]
  );
}
