/**
 * Money budgets CRUD: list / get / upsert / delete.
 */
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { MoneyBudgetScope, type MoneyBudget } from "~/types/money";
import { isoToDB } from "../core/datetime";
import { generateId, nowISO } from "../core/ids";
import { getPool } from "../core/pool";
import { sumMoneyMonth, sumMoneyOutByCategory } from "./money";
import {
  getMoneyUserCategoryById,
  mapMoneyUserCategoriesById,
} from "./moneyUserCategories";
import { yearMonthRange } from "~/utils/money";
import { MONEY_BUDGETS_MONTH_MAX } from "../../utils/listLimits";
import {
  type BudgetRow,
  type UpsertMoneyBudgetInput,
  resolveBudgetCategory,
  rowToBudget,
  spentForBudget,
} from "./moneyBudgetsShared";

export type { UpsertMoneyBudgetInput } from "./moneyBudgetsShared";

export async function listMoneyBudgets(
  userId: string,
  yearMonth: string,
): Promise<{
  yearMonth: string;
  budgets: MoneyBudget[];
  budgetMinor: number;
  spentMinor: number;
}> {
  const pool = getPool();
  const range = yearMonthRange(yearMonth);
  const [rows, byCategory, monthSums] = await Promise.all([
    pool
      .query<BudgetRow[]>(
        `SELECT * FROM money_budgets
         WHERE user_id = ? AND budget_ym = ?
         ORDER BY scope ASC, category ASC, user_category_id ASC, id ASC
         LIMIT ?`,
        [userId, yearMonth, MONEY_BUDGETS_MONTH_MAX],
      )
      .then(([r]) => r),
    sumMoneyOutByCategory(userId, range),
    sumMoneyMonth(userId, range),
  ]);

  const userCategories = await mapMoneyUserCategoriesById(
    userId,
    rows
      .map((r) => r.user_category_id)
      .filter((id): id is string => Boolean(id)),
  );

  const budgets = rows.map((r) =>
    rowToBudget(
      r,
      spentForBudget(r, byCategory, monthSums.outMinor),
      userCategories,
    ),
  );

  const overall = budgets.find((b) => b.scope === MoneyBudgetScope.Overall);
  const categoryBudgets = budgets.filter(
    (b) => b.scope === MoneyBudgetScope.Category,
  );
  const budgetMinor = overall
    ? overall.amountMinor
    : categoryBudgets.reduce((s, b) => s + b.amountMinor, 0);

  return {
    yearMonth,
    budgets,
    budgetMinor,
    spentMinor: monthSums.outMinor,
  };
}

export async function getMoneyBudgetById(
  userId: string,
  id: string,
): Promise<MoneyBudget | null> {
  const pool = getPool();
  const [rows] = await pool.query<BudgetRow[]>(
    `SELECT * FROM money_budgets WHERE user_id = ? AND id = ? LIMIT 1`,
    [userId, id],
  );
  const row = rows[0];
  if (!row) return null;
  const month = await listMoneyBudgets(userId, row.budget_ym);
  return month.budgets.find((b) => b.id === id) ?? null;
}

export async function moneyBudgetIdExists(id: string): Promise<boolean> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 AS ok FROM money_budgets WHERE id = ? LIMIT 1`,
    [id],
  );
  return Boolean(rows[0]);
}

export async function upsertMoneyBudget(
  userId: string,
  input: UpsertMoneyBudgetInput,
): Promise<{ budget: MoneyBudget; created: boolean }> {
  const pool = getPool();
  const now = nowISO();
  const cols = resolveBudgetCategory(input);

  if (cols.userCategoryId) {
    const custom = await getMoneyUserCategoryById(userId, cols.userCategoryId);
    if (!custom || custom.archivedAt) {
      const err = new Error("USER_CATEGORY_NOT_FOUND");
      (err as { code?: string }).code = "USER_CATEGORY_NOT_FOUND";
      throw err;
    }
  }

  if (input.id) {
    const existing = await getMoneyBudgetById(userId, input.id);
    if (existing) {
      await pool.query(
        `UPDATE money_budgets
         SET budget_ym = ?, scope = ?, category = ?, user_category_id = ?,
             amount_minor = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
        [
          input.yearMonth,
          input.scope,
          cols.category,
          cols.userCategoryId,
          input.amountMinor,
          isoToDB(now),
          input.id,
          userId,
        ],
      );
      const updated = await getMoneyBudgetById(userId, input.id);
      if (!updated) throw new Error("upsertMoneyBudget: update vanished");
      return { budget: updated, created: false };
    }
    if (await moneyBudgetIdExists(input.id)) {
      const err = new Error("NOT_FOUND");
      (err as { code?: string }).code = "NOT_FOUND";
      throw err;
    }
  }

  const [existingSlot] = await pool.query<BudgetRow[]>(
    `SELECT * FROM money_budgets
     WHERE user_id = ? AND budget_ym = ? AND scope = ?
       AND (
         (? IS NOT NULL AND user_category_id = ?)
         OR (? IS NULL AND category <=> ? AND user_category_id IS NULL)
       )
     LIMIT 1`,
    [
      userId,
      input.yearMonth,
      input.scope,
      cols.userCategoryId,
      cols.userCategoryId,
      cols.userCategoryId,
      cols.category,
    ],
  );
  const slot = existingSlot[0];
  if (slot) {
    await pool.query(
      `UPDATE money_budgets
       SET amount_minor = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
      [input.amountMinor, isoToDB(now), slot.id, userId],
    );
    const updated = await getMoneyBudgetById(userId, slot.id);
    if (!updated) throw new Error("upsertMoneyBudget: slot update vanished");
    return { budget: updated, created: false };
  }

  const id = generateId("mbd");
  try {
    await pool.query(
      `INSERT INTO money_budgets
        (id, user_id, budget_ym, scope, category, user_category_id, amount_minor, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        userId,
        input.yearMonth,
        input.scope,
        cols.category,
        cols.userCategoryId,
        input.amountMinor,
        isoToDB(now),
        isoToDB(now),
      ],
    );
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === "ER_DUP_ENTRY") {
      const conflict = new Error("CONFLICT");
      (conflict as { code?: string }).code = "CONFLICT";
      throw conflict;
    }
    throw err;
  }
  const created = await getMoneyBudgetById(userId, id);
  if (!created) throw new Error("upsertMoneyBudget: insert vanished");
  return { budget: created, created: true };
}

export async function deleteMoneyBudget(
  userId: string,
  id: string,
): Promise<boolean> {
  const pool = getPool();
  const [result] = await pool.query<ResultSetHeader>(
    `DELETE FROM money_budgets WHERE id = ? AND user_id = ?`,
    [id, userId],
  );
  return (result.affectedRows ?? 0) > 0;
}
