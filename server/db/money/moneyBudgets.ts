import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import {
  MoneyBudgetScope,
  budgetProgress,
  toMoneyBudgetScope,
  toMoneyCategory,
  type MoneyBudget,
  type MoneyBudgetScope as MoneyBudgetScopeT,
  type MoneyCategory,
} from "~/types/money";
import { dbToISO, isoToDB } from "../core/datetime";
import { generateId, nowISO } from "../core/ids";
import { getPool } from "../core/pool";
import { sumMoneyMonth, sumMoneyOutByCategory } from "./money";
import {
  getMoneyUserCategoryById,
  mapMoneyUserCategoriesById,
} from "./moneyUserCategories";
import { yearMonthRange } from "~/utils/money";
import { MONEY_BUDGETS_MONTH_MAX } from "../../utils/listLimits";

interface BudgetRow extends RowDataPacket {
  id: string;
  user_id: string;
  budget_ym: string;
  scope: number;
  category: number | null;
  user_category_id: string | null;
  amount_minor: number | string;
  created_at: string;
  updated_at: string;
}

function rowToBudget(
  r: BudgetRow,
  spentMinor: number,
  userCategories: Map<string, NonNullable<MoneyBudget["userCategory"]>>,
): MoneyBudget {
  const amountMinor = Number(r.amount_minor);
  const scope = toMoneyBudgetScope(r.scope);
  const userCategoryId = r.user_category_id ?? undefined;
  return {
    id: r.id,
    yearMonth: r.budget_ym,
    scope,
    category:
      scope === MoneyBudgetScope.Category &&
      r.category != null &&
      !userCategoryId
        ? toMoneyCategory(r.category)
        : undefined,
    userCategoryId,
    userCategory: userCategoryId
      ? userCategories.get(userCategoryId)
      : undefined,
    amountMinor,
    spentMinor,
    progress: budgetProgress(spentMinor, amountMinor),
    createdAt: dbToISO(r.created_at),
    updatedAt: dbToISO(r.updated_at),
  };
}

function spentForBudget(
  r: BudgetRow,
  byCategory: Map<string, number>,
  monthOut: number,
): number {
  const scope = toMoneyBudgetScope(r.scope);
  if (scope === MoneyBudgetScope.Overall) return monthOut;
  if (r.user_category_id) {
    return byCategory.get(`u:${r.user_category_id}`) ?? 0;
  }
  if (r.category != null) {
    return byCategory.get(`b:${Number(r.category)}`) ?? 0;
  }
  return 0;
}

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

export interface UpsertMoneyBudgetInput {
  id?: string;
  yearMonth: string;
  scope: MoneyBudgetScopeT;
  category?: MoneyCategory | null;
  userCategoryId?: string | null;
  amountMinor: number;
}

function resolveBudgetCategory(input: UpsertMoneyBudgetInput): {
  category: number | null;
  userCategoryId: string | null;
} {
  if (input.scope === MoneyBudgetScope.Overall) {
    return { category: null, userCategoryId: null };
  }
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

/**
 * Copy every usable budget slot from one month into another in a single
 * multi-row `INSERT … ON DUPLICATE KEY UPDATE` (unique on
 * `(user_id, budget_ym, slot_key)`). Skips rows whose custom category is
 * missing or archived — same as the old per-row upsert path.
 */
export async function copyMoneyBudgetsFromMonth(
  userId: string,
  fromYearMonth: string,
  toYearMonth: string,
): Promise<number> {
  if (fromYearMonth === toYearMonth) return 0;
  const pool = getPool();
  const [source] = await pool.query<BudgetRow[]>(
    `SELECT s.*
     FROM money_budgets s
     LEFT JOIN money_user_categories uc
       ON uc.id = s.user_category_id AND uc.user_id = s.user_id
     WHERE s.user_id = ? AND s.budget_ym = ?
       AND (
         s.user_category_id IS NULL
         OR (uc.id IS NOT NULL AND uc.archived_at IS NULL)
       )`,
    [userId, fromYearMonth],
  );
  if (!source.length) return 0;

  const now = nowISO();
  const nowDb = isoToDB(now);
  const values: unknown[] = [];
  const placeholders: string[] = [];
  for (const row of source) {
    placeholders.push("(?, ?, ?, ?, ?, ?, ?, ?, ?)");
    values.push(
      generateId("mbd"),
      userId,
      toYearMonth,
      row.scope,
      row.category,
      row.user_category_id,
      Number(row.amount_minor),
      nowDb,
      nowDb,
    );
  }

  await pool.query<ResultSetHeader>(
    `INSERT INTO money_budgets
       (id, user_id, budget_ym, scope, category, user_category_id,
        amount_minor, created_at, updated_at)
     VALUES ${placeholders.join(", ")}
     ON DUPLICATE KEY UPDATE
       amount_minor = VALUES(amount_minor),
       updated_at = VALUES(updated_at)`,
    values,
  );

  // Each source row maps to one unique slot in the target month.
  return source.length;
}
