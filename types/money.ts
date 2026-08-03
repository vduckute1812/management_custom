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
