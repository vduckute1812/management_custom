/**
 * Copy budget slots from one month into another.
 */
import type { ResultSetHeader } from "mysql2/promise";
import { isoToDB } from "../core/datetime";
import { generateId, nowISO } from "../core/ids";
import { getPool } from "../core/pool";
import { type BudgetRow } from "./moneyBudgetsShared";

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
