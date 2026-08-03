import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import {
  MoneyDirection,
  toMoneyCategory,
  toMoneyDirection,
  type MoneyCategory,
  type MoneyDirection as MoneyDirectionT,
  type MoneyTransaction,
} from "../../types/money";
import { dbToISO, isoToDB } from "./datetime";
import { generateId, nowISO } from "./ids";
import { getPool } from "./pool";

interface MoneyTxRow extends RowDataPacket {
  id: string;
  user_id: string;
  occurred_on: string | Date;
  amount_minor: number | string;
  direction: number;
  category: number;
  note: string | null;
  created_at: string;
  updated_at: string;
}

function dateOnlyFromDb(value: string | Date): string {
  if (value instanceof Date) {
    // Pool uses dateStrings; Date fallback treats the instant as UTC calendar day.
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const day = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return String(value).slice(0, 10);
}

function rowToTransaction(r: MoneyTxRow): MoneyTransaction {
  return {
    id: r.id,
    occurredOn: dateOnlyFromDb(r.occurred_on),
    amountMinor: Number(r.amount_minor),
    direction: toMoneyDirection(r.direction),
    category: toMoneyCategory(r.category),
    note: r.note ?? undefined,
    createdAt: dbToISO(r.created_at),
    updatedAt: dbToISO(r.updated_at),
  };
}

export async function listMoneyTransactions(
  userId: string,
  range: { start: string; end: string },
): Promise<MoneyTransaction[]> {
  const pool = getPool();
  const [rows] = await pool.query<MoneyTxRow[]>(
    `SELECT * FROM money_transactions
     WHERE user_id = ?
       AND occurred_on >= ?
       AND occurred_on <= ?
     ORDER BY occurred_on DESC, created_at DESC, id DESC`,
    [userId, range.start, range.end],
  );
  return rows.map(rowToTransaction);
}

export async function getMoneyTransactionById(
  userId: string,
  id: string,
): Promise<MoneyTransaction | null> {
  const pool = getPool();
  const [rows] = await pool.query<MoneyTxRow[]>(
    `SELECT * FROM money_transactions WHERE user_id = ? AND id = ? LIMIT 1`,
    [userId, id],
  );
  const row = rows[0];
  return row ? rowToTransaction(row) : null;
}

/** True if any row owns this id (any user) — used to 404 cross-user upserts. */
export async function moneyTransactionIdExists(id: string): Promise<boolean> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 AS ok FROM money_transactions WHERE id = ? LIMIT 1`,
    [id],
  );
  return Boolean(rows[0]);
}

export async function sumMoneyMonth(
  userId: string,
  range: { start: string; end: string },
): Promise<{ inMinor: number; outMinor: number; netMinor: number }> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
       COALESCE(SUM(CASE WHEN direction = ? THEN amount_minor ELSE 0 END), 0) AS in_minor,
       COALESCE(SUM(CASE WHEN direction = ? THEN amount_minor ELSE 0 END), 0) AS out_minor
     FROM money_transactions
     WHERE user_id = ?
       AND occurred_on >= ?
       AND occurred_on <= ?`,
    [MoneyDirection.In, MoneyDirection.Out, userId, range.start, range.end],
  );
  const inMinor = Number(rows[0]?.in_minor ?? 0);
  const outMinor = Number(rows[0]?.out_minor ?? 0);
  return { inMinor, outMinor, netMinor: inMinor - outMinor };
}

/** Expense (Out) totals keyed by category for a date range. */
export async function sumMoneyOutByCategory(
  userId: string,
  range: { start: string; end: string },
): Promise<Map<number, number>> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT category, COALESCE(SUM(amount_minor), 0) AS out_minor
     FROM money_transactions
     WHERE user_id = ?
       AND direction = ?
       AND occurred_on >= ?
       AND occurred_on <= ?
     GROUP BY category`,
    [userId, MoneyDirection.Out, range.start, range.end],
  );
  const map = new Map<number, number>();
  for (const row of rows) {
    map.set(Number(row.category), Number(row.out_minor));
  }
  return map;
}

export interface UpsertMoneyTransactionInput {
  id?: string;
  occurredOn: string;
  amountMinor: number;
  direction: MoneyDirectionT;
  category: MoneyCategory;
  note?: string | null;
}

export async function upsertMoneyTransaction(
  userId: string,
  input: UpsertMoneyTransactionInput,
): Promise<{ transaction: MoneyTransaction; created: boolean }> {
  const pool = getPool();
  const now = nowISO();
  const note = input.note?.trim() || null;

  if (input.id) {
    const existing = await getMoneyTransactionById(userId, input.id);
    if (existing) {
      await pool.query(
        `UPDATE money_transactions
         SET occurred_on = ?, amount_minor = ?, direction = ?, category = ?,
             note = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
        [
          input.occurredOn,
          input.amountMinor,
          input.direction,
          input.category,
          note,
          isoToDB(now),
          input.id,
          userId,
        ],
      );
      const updated = await getMoneyTransactionById(userId, input.id);
      if (!updated) throw new Error("upsertMoneyTransaction: update vanished");
      return { transaction: updated, created: false };
    }
    if (await moneyTransactionIdExists(input.id)) {
      const err = new Error("NOT_FOUND");
      (err as { code?: string }).code = "NOT_FOUND";
      throw err;
    }
  }

  const id = generateId("mtx");
  await pool.query(
    `INSERT INTO money_transactions
      (id, user_id, occurred_on, amount_minor, direction, category, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      userId,
      input.occurredOn,
      input.amountMinor,
      input.direction,
      input.category,
      note,
      isoToDB(now),
      isoToDB(now),
    ],
  );
  const created = await getMoneyTransactionById(userId, id);
  if (!created) throw new Error("upsertMoneyTransaction: insert vanished");
  return { transaction: created, created: true };
}

export async function deleteMoneyTransaction(
  userId: string,
  id: string,
): Promise<boolean> {
  const pool = getPool();
  const [result] = await pool.query<ResultSetHeader>(
    `DELETE FROM money_transactions WHERE id = ? AND user_id = ?`,
    [id, userId],
  );
  return (result.affectedRows ?? 0) > 0;
}
