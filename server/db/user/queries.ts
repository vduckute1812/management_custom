import type { RowDataPacket } from "mysql2/promise";
import { rowToUser, type UserRow } from "../mappers";
import { getPool } from "../pool";
import type { UserRecord } from "../types";

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
