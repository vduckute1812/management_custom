import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import {
  MoneyDirection,
  toMoneyCategory,
  toMoneyDirection,
  type MoneyCategory,
  type MoneyDirection as MoneyDirectionT,
  type MoneyTransaction,
  type MoneyUserCategory,
} from "~/types/money";
import { dbToISO, isoToDB } from "../core/datetime";
import { generateId, nowISO } from "../core/ids";
import { getPool } from "../core/pool";
import {
  mapMoneyUserCategoriesById,
  rowToUserCategory,
} from "./moneyUserCategories";
import {
  encodeTimestampCursor,
  parseTimestampCursor,
} from "../core/timestampCursor";

interface MoneyTxRow extends RowDataPacket {
  id: string;
  user_id: string;
  occurred_on: string | Date;
  amount_minor: number | string;
  direction: number;
  category: number | null;
  user_category_id: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  uc_id?: string | null;
  uc_name?: string | null;
  uc_emoji?: string | null;
  uc_color?: string | null;
  uc_direction?: number | null;
  uc_sort_order?: number | string | null;
  uc_archived_at?: string | null;
  uc_created_at?: string | null;
  uc_updated_at?: string | null;
}

function dateOnlyFromDb(value: string | Date): string {
  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const day = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return String(value).slice(0, 10);
}

function joinedUserCategory(r: MoneyTxRow): MoneyUserCategory | undefined {
  if (!r.user_category_id || !r.uc_id) return undefined;
  return rowToUserCategory({
    id: r.uc_id,
    user_id: r.user_id,
    name: r.uc_name ?? "",
    emoji: r.uc_emoji ?? "📌",
    color: r.uc_color ?? "#94a3b8",
    direction: Number(r.uc_direction ?? 0),
    sort_order: r.uc_sort_order ?? 0,
    archived_at: r.uc_archived_at ?? null,
    created_at: r.uc_created_at ?? r.created_at,
    updated_at: r.uc_updated_at ?? r.updated_at,
  } as Parameters<typeof rowToUserCategory>[0]);
}

function rowToTransaction(r: MoneyTxRow): MoneyTransaction {
  const userCategory = joinedUserCategory(r);
  return {
    id: r.id,
    occurredOn: dateOnlyFromDb(r.occurred_on),
    amountMinor: Number(r.amount_minor),
    direction: toMoneyDirection(r.direction),
    category: r.category != null ? toMoneyCategory(r.category) : null,
    userCategoryId: r.user_category_id ?? undefined,
    userCategory,
    note: r.note ?? undefined,
    createdAt: dbToISO(r.created_at),
    updatedAt: dbToISO(r.updated_at),
  };
}

const TX_SELECT = `
  SELECT t.*,
    uc.id AS uc_id,
    uc.name AS uc_name,
    uc.emoji AS uc_emoji,
    uc.color AS uc_color,
    uc.direction AS uc_direction,
    uc.sort_order AS uc_sort_order,
    uc.archived_at AS uc_archived_at,
    uc.created_at AS uc_created_at,
    uc.updated_at AS uc_updated_at
  FROM money_transactions t
  LEFT JOIN money_user_categories uc
    ON uc.id = t.user_category_id AND uc.user_id = t.user_id
`;

export async function listMoneyTransactions(
  userId: string,
  range: { start: string; end: string },
  options: { limit?: number; cursor?: string | null } = {},
): Promise<{
  transactions: MoneyTransaction[];
  nextCursor: string | null;
}> {
  const pool = getPool();
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 200);
  const params: unknown[] = [userId, range.start, range.end];
  let cursorClause = "";
  if (options.cursor) {
    const cursor = parseTimestampCursor(options.cursor);
    const occurredOn = cursor.timestamp.slice(0, 10);
    cursorClause = `AND (
      t.occurred_on < ?
      OR (t.occurred_on = ? AND t.id < ?)
    )`;
    params.push(occurredOn, occurredOn, cursor.id);
  }
  params.push(limit + 1);
  const [rows] = await pool.query<MoneyTxRow[]>(
    `${TX_SELECT}
     WHERE t.user_id = ?
       AND t.occurred_on >= ?
       AND t.occurred_on <= ?
       ${cursorClause}
     ORDER BY t.occurred_on DESC, t.id DESC
     LIMIT ?`,
    params,
  );
  const hasMore = rows.length > limit;
  const transactions = (hasMore ? rows.slice(0, limit) : rows).map(
    rowToTransaction,
  );
  const last = transactions[transactions.length - 1];
  return {
    transactions,
    nextCursor:
      hasMore && last
        ? encodeTimestampCursor(`${last.occurredOn}T00:00:00.000Z`, last.id)
        : null,
  };
}

export async function getMoneyTransactionById(
  userId: string,
  id: string,
): Promise<MoneyTransaction | null> {
  const pool = getPool();
  const [rows] = await pool.query<MoneyTxRow[]>(
    `${TX_SELECT}
     WHERE t.user_id = ? AND t.id = ?
     LIMIT 1`,
    [userId, id],
  );
  const row = rows[0];
  return row ? rowToTransaction(row) : null;
}

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

export type MoneyOutCategoryKey =
  | { kind: "builtin"; category: number }
  | { kind: "custom"; userCategoryId: string };

/** Expense (Out) totals keyed by builtin or custom category. */
export async function sumMoneyOutByCategory(
  userId: string,
  range: { start: string; end: string },
): Promise<Map<string, number>> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT category, user_category_id,
            COALESCE(SUM(amount_minor), 0) AS out_minor
     FROM money_transactions
     WHERE user_id = ?
       AND direction = ?
       AND occurred_on >= ?
       AND occurred_on <= ?
     GROUP BY category, user_category_id`,
    [userId, MoneyDirection.Out, range.start, range.end],
  );
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = row.user_category_id
      ? `u:${row.user_category_id}`
      : `b:${Number(row.category)}`;
    map.set(key, Number(row.out_minor));
  }
  return map;
}

export interface UpsertMoneyTransactionInput {
  id?: string;
  occurredOn: string;
  amountMinor: number;
  direction: MoneyDirectionT;
  category?: MoneyCategory | null;
  userCategoryId?: string | null;
  note?: string | null;
}

function resolveCategoryColumns(input: UpsertMoneyTransactionInput): {
  category: number | null;
  userCategoryId: string | null;
} {
  if (input.userCategoryId) {
    return { category: null, userCategoryId: input.userCategoryId };
  }
  if (input.category != null) {
    return { category: input.category, userCategoryId: null };
  }
  const err = new Error("CATEGORY_REQUIRED");
  (err as { code?: string }).code = "CATEGORY_REQUIRED";
  throw err;
}

export async function upsertMoneyTransaction(
  userId: string,
  input: UpsertMoneyTransactionInput,
): Promise<{ transaction: MoneyTransaction; created: boolean }> {
  const pool = getPool();
  const now = nowISO();
  const note = input.note?.trim() || null;
  const cols = resolveCategoryColumns(input);

  if (cols.userCategoryId) {
    const { getMoneyUserCategoryById } = await import("./moneyUserCategories");
    const custom = await getMoneyUserCategoryById(userId, cols.userCategoryId);
    if (!custom || custom.archivedAt) {
      const err = new Error("USER_CATEGORY_NOT_FOUND");
      (err as { code?: string }).code = "USER_CATEGORY_NOT_FOUND";
      throw err;
    }
  }

  if (input.id) {
    const existing = await getMoneyTransactionById(userId, input.id);
    if (existing) {
      await pool.query(
        `UPDATE money_transactions
         SET occurred_on = ?, amount_minor = ?, direction = ?, category = ?,
             user_category_id = ?, note = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
        [
          input.occurredOn,
          input.amountMinor,
          input.direction,
          cols.category,
          cols.userCategoryId,
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
      (id, user_id, occurred_on, amount_minor, direction, category, user_category_id, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      userId,
      input.occurredOn,
      input.amountMinor,
      input.direction,
      cols.category,
      cols.userCategoryId,
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

/** Attach user categories for a list of ids (helper for budgets). */
export async function loadUserCategoriesForIds(
  userId: string,
  ids: Array<string | null | undefined>,
): Promise<Map<string, MoneyUserCategory>> {
  return mapMoneyUserCategoriesById(
    userId,
    ids.filter((id): id is string => Boolean(id)),
  );
}
