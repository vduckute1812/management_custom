import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import {
  toMoneyDirection,
  type MoneyDirection,
  type MoneyUserCategory,
} from "~/types/money";
import { DomainError } from "~/server/utils/http";
import { dbToISO, isoToDB } from "../core/datetime";
import { generateId, nowISO } from "../core/ids";
import { getPool } from "../core/pool";
import { MONEY_USER_CATEGORIES_MAX } from "../../utils/listLimits";

interface UserCategoryRow extends RowDataPacket {
  id: string;
  user_id: string;
  name: string;
  emoji: string;
  color: string;
  direction: number;
  sort_order: number | string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export function rowToUserCategory(r: UserCategoryRow): MoneyUserCategory {
  return {
    id: r.id,
    name: r.name,
    emoji: r.emoji || "📌",
    color: r.color || "#94a3b8",
    direction: toMoneyDirection(r.direction),
    sortOrder: Number(r.sort_order) || 0,
    archivedAt: r.archived_at ? dbToISO(r.archived_at) : undefined,
    createdAt: dbToISO(r.created_at),
    updatedAt: dbToISO(r.updated_at),
  };
}

export async function listMoneyUserCategories(
  userId: string,
  opts?: { includeArchived?: boolean; direction?: MoneyDirection },
): Promise<MoneyUserCategory[]> {
  const pool = getPool();
  const clauses = ["user_id = ?"];
  const params: unknown[] = [userId];
  if (!opts?.includeArchived) {
    clauses.push("archived_at IS NULL");
  }
  if (opts?.direction != null) {
    clauses.push("direction = ?");
    params.push(opts.direction);
  }
  const [rows] = await pool.query<UserCategoryRow[]>(
    `SELECT * FROM money_user_categories
     WHERE ${clauses.join(" AND ")}
     ORDER BY sort_order ASC, created_at ASC, id ASC
     LIMIT ?`,
    [...params, MONEY_USER_CATEGORIES_MAX],
  );
  return rows.map(rowToUserCategory);
}

export async function getMoneyUserCategoryById(
  userId: string,
  id: string,
): Promise<MoneyUserCategory | null> {
  const pool = getPool();
  const [rows] = await pool.query<UserCategoryRow[]>(
    `SELECT * FROM money_user_categories WHERE user_id = ? AND id = ? LIMIT 1`,
    [userId, id],
  );
  const row = rows[0];
  return row ? rowToUserCategory(row) : null;
}

export async function moneyUserCategoryIdExists(id: string): Promise<boolean> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 AS ok FROM money_user_categories WHERE id = ? LIMIT 1`,
    [id],
  );
  return Boolean(rows[0]);
}

export async function mapMoneyUserCategoriesById(
  userId: string,
  ids: string[],
): Promise<Map<string, MoneyUserCategory>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const map = new Map<string, MoneyUserCategory>();
  if (!unique.length) return map;
  const pool = getPool();
  const placeholders = unique.map(() => "?").join(",");
  const [rows] = await pool.query<UserCategoryRow[]>(
    `SELECT * FROM money_user_categories
     WHERE user_id = ? AND id IN (${placeholders})`,
    [userId, ...unique],
  );
  for (const row of rows) {
    map.set(row.id, rowToUserCategory(row));
  }
  return map;
}

export interface UpsertMoneyUserCategoryInput {
  id?: string;
  name: string;
  emoji: string;
  color: string;
  direction: MoneyDirection;
  sortOrder?: number;
}

export async function upsertMoneyUserCategory(
  userId: string,
  input: UpsertMoneyUserCategoryInput,
): Promise<{ category: MoneyUserCategory; created: boolean }> {
  const pool = getPool();
  const now = nowISO();
  const name = input.name.trim();
  const emoji = input.emoji.trim() || "📌";
  const color = input.color.trim() || "#94a3b8";
  const sortOrder = input.sortOrder ?? 0;

  if (input.id) {
    const existing = await getMoneyUserCategoryById(userId, input.id);
    if (existing) {
      await pool.query(
        `UPDATE money_user_categories
         SET name = ?, emoji = ?, color = ?, direction = ?, sort_order = ?,
             archived_at = NULL, updated_at = ?
         WHERE id = ? AND user_id = ?`,
        [
          name,
          emoji,
          color,
          input.direction,
          sortOrder,
          isoToDB(now),
          input.id,
          userId,
        ],
      );
      const updated = await getMoneyUserCategoryById(userId, input.id);
      if (!updated) throw new Error("upsertMoneyUserCategory: update vanished");
      return { category: updated, created: false };
    }
    if (await moneyUserCategoryIdExists(input.id)) {
      throw new DomainError(404, "Category not found");
    }
  }

  const id = generateId("mcat");
  await pool.query(
    `INSERT INTO money_user_categories
      (id, user_id, name, emoji, color, direction, sort_order, archived_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    [
      id,
      userId,
      name,
      emoji,
      color,
      input.direction,
      sortOrder,
      isoToDB(now),
      isoToDB(now),
    ],
  );
  const created = await getMoneyUserCategoryById(userId, id);
  if (!created) throw new Error("upsertMoneyUserCategory: insert vanished");
  return { category: created, created: true };
}

export async function archiveMoneyUserCategory(
  userId: string,
  id: string,
): Promise<boolean> {
  const pool = getPool();
  const now = nowISO();
  const [result] = await pool.query<ResultSetHeader>(
    `UPDATE money_user_categories
     SET archived_at = ?, updated_at = ?
     WHERE id = ? AND user_id = ? AND archived_at IS NULL`,
    [isoToDB(now), isoToDB(now), id, userId],
  );
  return (result.affectedRows ?? 0) > 0;
}
