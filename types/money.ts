/**
 * Money module — expense ledger + (future) savings.
 *
 * Amounts are integer **minor units** of the install currency (VND đồng).
 * Never store fractional VND. Direction is a separate integer enum so
 * `amountMinor` is always ≥ 0.
 */

/** Cash flow direction for a ledger row. */
export const MoneyDirection = {
  Out: 0,
  In: 1,
} as const;
export type MoneyDirection =
  (typeof MoneyDirection)[keyof typeof MoneyDirection];
export const MONEY_DIRECTIONS = [
  MoneyDirection.Out,
  MoneyDirection.In,
] as const;

/**
 * Built-in categories for Sprint 1 (labels via i18n).
 * Sprint 2 may add a user category table — keep these ints stable.
 */
export const MoneyCategory = {
  Food: 0,
  Transport: 1,
  Housing: 2,
  Utilities: 3,
  Health: 4,
  Entertainment: 5,
  Shopping: 6,
  Education: 7,
  Income: 8,
  Transfer: 9,
  Other: 10,
} as const;
export type MoneyCategory = (typeof MoneyCategory)[keyof typeof MoneyCategory];
export const MONEY_CATEGORIES = [
  MoneyCategory.Food,
  MoneyCategory.Transport,
  MoneyCategory.Housing,
  MoneyCategory.Utilities,
  MoneyCategory.Health,
  MoneyCategory.Entertainment,
  MoneyCategory.Shopping,
  MoneyCategory.Education,
  MoneyCategory.Income,
  MoneyCategory.Transfer,
  MoneyCategory.Other,
] as const;

export const MONEY_CATEGORY_I18N_KEYS: Record<MoneyCategory, string> = {
  [MoneyCategory.Food]: "money.categories.food",
  [MoneyCategory.Transport]: "money.categories.transport",
  [MoneyCategory.Housing]: "money.categories.housing",
  [MoneyCategory.Utilities]: "money.categories.utilities",
  [MoneyCategory.Health]: "money.categories.health",
  [MoneyCategory.Entertainment]: "money.categories.entertainment",
  [MoneyCategory.Shopping]: "money.categories.shopping",
  [MoneyCategory.Education]: "money.categories.education",
  [MoneyCategory.Income]: "money.categories.income",
  [MoneyCategory.Transfer]: "money.categories.transfer",
  [MoneyCategory.Other]: "money.categories.other",
};

/** Presentational swatches for chips / charts (not stored). */
export const MONEY_CATEGORY_COLORS: Record<MoneyCategory, string> = {
  [MoneyCategory.Food]: "#f97316",
  [MoneyCategory.Transport]: "#0ea5e9",
  [MoneyCategory.Housing]: "#64748b",
  [MoneyCategory.Utilities]: "#eab308",
  [MoneyCategory.Health]: "#ef4444",
  [MoneyCategory.Entertainment]: "#db2777",
  [MoneyCategory.Shopping]: "#14b8a6",
  [MoneyCategory.Education]: "#3b82f6",
  [MoneyCategory.Income]: "#10b981",
  [MoneyCategory.Transfer]: "#06b6d4",
  [MoneyCategory.Other]: "#94a3b8",
};

/** Typical expense categories (excludes Income). */
export const MONEY_EXPENSE_CATEGORIES = MONEY_CATEGORIES.filter(
  (c) => c !== MoneyCategory.Income,
) as readonly MoneyCategory[];

export function defaultCategoryForDirection(
  direction: MoneyDirection,
): MoneyCategory {
  return direction === MoneyDirection.In
    ? MoneyCategory.Income
    : MoneyCategory.Food;
}

/**
 * When the user flips In/Out, nudge an obviously mismatched category
 * (Income ↔ expense) without fighting Transfer/Other.
 */
export function coerceCategoryForDirection(
  category: MoneyCategory,
  direction: MoneyDirection,
): MoneyCategory {
  if (
    direction === MoneyDirection.In &&
    category !== MoneyCategory.Income &&
    category !== MoneyCategory.Transfer &&
    category !== MoneyCategory.Other
  ) {
    return MoneyCategory.Income;
  }
  if (direction === MoneyDirection.Out && category === MoneyCategory.Income) {
    return MoneyCategory.Food;
  }
  return category;
}

/** Install currency for v1 — VND has no fractional subunit in practice. */
export const MONEY_CURRENCY = "VND" as const;

export interface MoneyTransaction {
  id: string;
  /** ISO date `YYYY-MM-DD` (calendar day in the user's intent). */
  occurredOn: string;
  /** Always ≥ 0 (minor units). */
  amountMinor: number;
  direction: MoneyDirection;
  category: MoneyCategory;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MoneyMonthTotals {
  yearMonth: string;
  inMinor: number;
  outMinor: number;
  netMinor: number;
}

/** Savings goal lifecycle. */
export const MoneySavingsGoalStatus = {
  Active: 0,
  Completed: 1,
  Archived: 2,
} as const;
export type MoneySavingsGoalStatus =
  (typeof MoneySavingsGoalStatus)[keyof typeof MoneySavingsGoalStatus];
export const MONEY_SAVINGS_GOAL_STATUSES = [
  MoneySavingsGoalStatus.Active,
  MoneySavingsGoalStatus.Completed,
  MoneySavingsGoalStatus.Archived,
] as const;

export const MONEY_SAVINGS_GOAL_STATUS_I18N_KEYS: Record<
  MoneySavingsGoalStatus,
  string
> = {
  [MoneySavingsGoalStatus.Active]: "money.savings.status.active",
  [MoneySavingsGoalStatus.Completed]: "money.savings.status.completed",
  [MoneySavingsGoalStatus.Archived]: "money.savings.status.archived",
};

export interface MoneySavingsContribution {
  id: string;
  goalId: string;
  occurredOn: string;
  amountMinor: number;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MoneySavingsGoal {
  id: string;
  title: string;
  /** Target amount (≥ 0). */
  targetMinor: number;
  status: MoneySavingsGoalStatus;
  /** Optional deadline YYYY-MM-DD. */
  targetDate?: string;
  note?: string;
  /** Sum of contributions (derived). */
  savedMinor: number;
  /** savedMinor / targetMinor, capped conceptually in UI (derived). */
  progress: number;
  createdAt: string;
  updatedAt: string;
}

export function isMoneySavingsGoalStatus(
  value: unknown,
): value is MoneySavingsGoalStatus {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    (MONEY_SAVINGS_GOAL_STATUSES as readonly number[]).includes(value)
  );
}

export function toMoneySavingsGoalStatus(
  value: unknown,
): MoneySavingsGoalStatus {
  return isMoneySavingsGoalStatus(value)
    ? value
    : MoneySavingsGoalStatus.Active;
}

export function savingsProgress(
  savedMinor: number,
  targetMinor: number,
): number {
  if (!Number.isFinite(savedMinor) || savedMinor <= 0) return 0;
  if (!Number.isFinite(targetMinor) || targetMinor <= 0) return 0;
  return savedMinor / targetMinor;
}

export function isMoneyDirection(value: unknown): value is MoneyDirection {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    (MONEY_DIRECTIONS as readonly number[]).includes(value)
  );
}

export function isMoneyCategory(value: unknown): value is MoneyCategory {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    (MONEY_CATEGORIES as readonly number[]).includes(value)
  );
}

export function toMoneyDirection(value: unknown): MoneyDirection {
  return isMoneyDirection(value) ? value : MoneyDirection.Out;
}

export function toMoneyCategory(value: unknown): MoneyCategory {
  return isMoneyCategory(value) ? value : MoneyCategory.Other;
}
