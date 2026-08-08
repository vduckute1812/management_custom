import type { MoneyCategory, MoneyUserCategory } from "./categories";

/** Monthly budget row scope. */
export const MoneyBudgetScope = {
  Overall: 0,
  Category: 1,
} as const;
export type MoneyBudgetScope =
  (typeof MoneyBudgetScope)[keyof typeof MoneyBudgetScope];
export const MONEY_BUDGET_SCOPES = [
  MoneyBudgetScope.Overall,
  MoneyBudgetScope.Category,
] as const;

export interface MoneyBudget {
  id: string;
  yearMonth: string;
  scope: MoneyBudgetScope;
  /** Present when scope=Category and using a built-in. */
  category?: MoneyCategory;
  /** Present when scope=Category and using a custom category. */
  userCategoryId?: string;
  userCategory?: MoneyUserCategory;
  amountMinor: number;
  /** Outflow spent against this budget (derived from ledger). */
  spentMinor: number;
  /** spentMinor / amountMinor (0 if no budget). */
  progress: number;
  createdAt: string;
  updatedAt: string;
}

export interface MoneyBudgetsMonth {
  yearMonth: string;
  budgets: MoneyBudget[];
  /** Sum of Overall budget amount, else sum of category budgets. */
  budgetMinor: number;
  /** Total Out for the month. */
  spentMinor: number;
}

export function isMoneyBudgetScope(value: unknown): value is MoneyBudgetScope {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    (MONEY_BUDGET_SCOPES as readonly number[]).includes(value)
  );
}

export function toMoneyBudgetScope(value: unknown): MoneyBudgetScope {
  return isMoneyBudgetScope(value) ? value : MoneyBudgetScope.Category;
}

export function budgetProgress(
  spentMinor: number,
  amountMinor: number,
): number {
  if (!Number.isFinite(spentMinor) || spentMinor <= 0) return 0;
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) return 0;
  return spentMinor / amountMinor;
}
