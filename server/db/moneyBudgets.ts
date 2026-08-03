import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import {
  MoneyBudgetScope,
  budgetProgress,
  toMoneyBudgetScope,
  toMoneyCategory,
  type MoneyBudget,
  type MoneyBudgetScope as MoneyBudgetScopeT,
  type MoneyCategory,
} from "../../types/money";
import { dbToISO, isoToDB } from "./datetime";
import { generateId, nowISO } from "./ids";
import { getPool } from "./pool";
import { sumMoneyMonth, sumMoneyOutByCategory } from "./money";
import { yearMonthRange } from "../../utils/money";

interface BudgetRow extends RowDataPacket {
  id: string;
  user_id: string;
  year_month: string;
  scope: number;
  category: number | null;
  amount_minor: number | string;
  created_at: string;
  updated_at: string;
}

function rowToBudget(r: BudgetRow, spentMinor: number): MoneyBudget {
  const amountMinor = Number(r.amount_minor);
  const scope = toMoneyBudgetScope(r.scope);
  return {
    id: r.id,
    yearMonth: r.year_month,
    scope,
    category:
      scope === MoneyBudgetScope.Category && r.category != null
        ? toMoneyCategory(r.category)
        : undefined,
    amountMinor,
    spentMinor,
    progress: budgetProgress(spentMinor, amountMinor),
    createdAt: dbToISO(r.created_at),
    updatedAt: dbToISO(r.updated_at),
  };
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
         WHERE user_id = ? AND year_month = ?
         ORDER BY scope ASC, category ASC, id ASC`,
        [userId, yearMonth],
      )
      .then(([r]) => r),
    sumMoneyOutByCategory(userId, range),
    sumMoneyMonth(userId, range),
  ]);

  const budgets = rows.map((r) => {
    const scope = toMoneyBudgetScope(r.scope);
    let spent = 0;
    if (scope === MoneyBudgetScope.Overall) {
      spent = monthSums.outMinor;
    } else if (r.category != null) {
      spent = byCategory.get(Number(r.category)) ?? 0;
    }
    return rowToBudget(r, spent);
  });

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
  const month = await listMoneyBudgets(userId, row.year_month);
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
  amountMinor: number;
}

export async function upsertMoneyBudget(
  userId: string,
  input: UpsertMoneyBudgetInput,
): Promise<{ budget: MoneyBudget; created: boolean }> {
  const pool = getPool();
  const now = nowISO();
  const category =
    input.scope === MoneyBudgetScope.Overall ? null : (input.category ?? null);
  if (input.scope === MoneyBudgetScope.Category && category == null) {
    const err = new Error("CATEGORY_REQUIRED");
    (err as { code?: string }).code = "CATEGORY_REQUIRED";
    throw err;
  }

  if (input.id) {
    const existing = await getMoneyBudgetById(userId, input.id);
    if (existing) {
      await pool.query(
        `UPDATE money_budgets
         SET year_month = ?, scope = ?, category = ?, amount_minor = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
        [
          input.yearMonth,
          input.scope,
          category,
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

  // Upsert by natural slot when no id — replace existing slot.
  const [existingSlot] = await pool.query<BudgetRow[]>(
    `SELECT * FROM money_budgets
     WHERE user_id = ? AND year_month = ? AND scope = ?
       AND IFNULL(category, 255) = IFNULL(?, 255)
     LIMIT 1`,
    [userId, input.yearMonth, input.scope, category],
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
        (id, user_id, year_month, scope, category, amount_minor, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        userId,
        input.yearMonth,
        input.scope,
        category,
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

export async function copyMoneyBudgetsFromMonth(
  userId: string,
  fromYearMonth: string,
  toYearMonth: string,
): Promise<number> {
  if (fromYearMonth === toYearMonth) return 0;
  const pool = getPool();
  const [source] = await pool.query<BudgetRow[]>(
    `SELECT * FROM money_budgets WHERE user_id = ? AND year_month = ?`,
    [userId, fromYearMonth],
  );
  if (!source.length) return 0;
  const now = isoToDB(nowISO());
  let copied = 0;
  for (const row of source) {
    const id = generateId("mbd");
    try {
      await pool.query(
        `INSERT INTO money_budgets
          (id, user_id, year_month, scope, category, amount_minor, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           amount_minor = VALUES(amount_minor),
           updated_at = VALUES(updated_at)`,
        [
          id,
          userId,
          toYearMonth,
          row.scope,
          row.category,
          row.amount_minor,
          now,
          now,
        ],
      );
      copied += 1;
    } catch {
      // Skip unusable rows; ON DUPLICATE handles unique slot races.
    }
  }
  return copied;
}
