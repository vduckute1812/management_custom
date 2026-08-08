import type { RowDataPacket } from "mysql2/promise";
import {
  AuthProvider,
  isAuthProvider,
  type AuthProvider as AuthProviderT,
} from "~/types/auth";
import { isoToDB } from "../core/datetime";
import { generateId, nowISO } from "../core/ids";
import { getPool } from "../core/pool";

export interface AuthIdentityRecord {
  id: string;
  userId: string;
  provider: AuthProviderT;
  providerSubject: string;
  providerEmail?: string;
  createdAt: string;
  updatedAt: string;
}

interface AuthIdentityRow extends RowDataPacket {
  id: string;
  user_id: string;
  provider: number;
  provider_subject: string;
  provider_email: string | null;
  created_at: string;
  updated_at: string;
}

function toProvider(n: unknown): AuthProviderT {
  const v = Number(n);
  return isAuthProvider(v) ? v : AuthProvider.Google;
}

function rowToIdentity(r: AuthIdentityRow): AuthIdentityRecord {
  return {
    id: r.id,
    userId: r.user_id,
    provider: toProvider(r.provider),
    providerSubject: r.provider_subject,
    providerEmail: r.provider_email ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function getIdentityByProviderSubject(
  provider: AuthProviderT,
  subject: string,
): Promise<AuthIdentityRecord | null> {
  const pool = getPool();
  const [rows] = await pool.query<AuthIdentityRow[]>(
    `SELECT * FROM auth_identities
     WHERE provider = ? AND provider_subject = ?
     LIMIT 1`,
    [provider, subject],
  );
  const row = rows[0];
  return row ? rowToIdentity(row) : null;
}

export async function listIdentitiesForUser(
  userId: string,
): Promise<AuthIdentityRecord[]> {
  const pool = getPool();
  const [rows] = await pool.query<AuthIdentityRow[]>(
    `SELECT * FROM auth_identities WHERE user_id = ? ORDER BY provider ASC`,
    [userId],
  );
  return rows.map(rowToIdentity);
}

export async function userHasProvider(
  userId: string,
  provider: AuthProviderT,
): Promise<boolean> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 AS ok FROM auth_identities
     WHERE user_id = ? AND provider = ?
     LIMIT 1`,
    [userId, provider],
  );
  return Boolean(rows[0]);
}

export async function linkIdentity(input: {
  userId: string;
  provider: AuthProviderT;
  providerSubject: string;
  providerEmail?: string | null;
}): Promise<AuthIdentityRecord> {
  const pool = getPool();
  const id = generateId("oid");
  const now = nowISO();
  await pool.query(
    `INSERT INTO auth_identities
      (id, user_id, provider, provider_subject, provider_email, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.userId,
      input.provider,
      input.providerSubject,
      input.providerEmail?.toLowerCase() ?? null,
      isoToDB(now),
      isoToDB(now),
    ],
  );
  const created = await getIdentityByProviderSubject(
    input.provider,
    input.providerSubject,
  );
  if (!created) {
    throw new Error("linkIdentity: row vanished immediately after insert");
  }
  return created;
}

export async function unlinkIdentity(
  userId: string,
  provider: AuthProviderT,
): Promise<boolean> {
  const pool = getPool();
  const [result] = await pool.query(
    `DELETE FROM auth_identities WHERE user_id = ? AND provider = ?`,
    [userId, provider],
  );
  const header = result as { affectedRows?: number };
  return (header.affectedRows ?? 0) > 0;
}
