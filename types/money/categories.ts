import { MoneyDirection } from "./direction";
import type { MoneyDirection as MoneyDirectionValue } from "./direction";

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

/** Built-in category emoji (UI only). */
export const MONEY_CATEGORY_EMOJI: Record<MoneyCategory, string> = {
  [MoneyCategory.Food]: "🍜",
  [MoneyCategory.Transport]: "⛽",
  [MoneyCategory.Housing]: "🏠",
  [MoneyCategory.Utilities]: "💡",
  [MoneyCategory.Health]: "💊",
  [MoneyCategory.Entertainment]: "🎬",
  [MoneyCategory.Shopping]: "🛍️",
  [MoneyCategory.Education]: "📚",
  [MoneyCategory.Income]: "💰",
  [MoneyCategory.Transfer]: "🔄",
  [MoneyCategory.Other]: "📦",
};

/** Typical expense categories (excludes Income). */
export const MONEY_EXPENSE_CATEGORIES = MONEY_CATEGORIES.filter(
  (c) => c !== MoneyCategory.Income,
) as readonly MoneyCategory[];

/** Default palette for new user categories. */
export const MONEY_USER_CATEGORY_COLORS = [
  "#f97316",
  "#0ea5e9",
  "#64748b",
  "#eab308",
  "#ef4444",
  "#db2777",
  "#14b8a6",
  "#3b82f6",
  "#10b981",
  "#06b6d4",
  "#8b5cf6",
  "#94a3b8",
] as const;

export const MONEY_USER_CATEGORY_EMOJI_SUGGESTIONS = [
  "⛽",
  "🚗",
  "🍜",
  "☕",
  "🏠",
  "💡",
  "💊",
  "🎬",
  "🛍️",
  "📚",
  "💰",
  "✈️",
  "🏋️",
  "🐕",
  "🎁",
  "📱",
  "🧾",
  "📌",
] as const;

export interface MoneyUserCategory {
  id: string;
  name: string;
  emoji: string;
  color: string;
  direction: MoneyDirectionValue;
  sortOrder: number;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Opaque category pick used by UI dropdowns / filters.
 * Built-ins stay integer enums; customs reference `money_user_categories.id`.
 */
export type MoneyCategoryPick =
  | { kind: "builtin"; category: MoneyCategory }
  | { kind: "custom"; userCategoryId: string };

export function moneyCategoryKey(pick: MoneyCategoryPick): string {
  return pick.kind === "builtin"
    ? `b:${pick.category}`
    : `u:${pick.userCategoryId}`;
}

export function parseMoneyCategoryKey(
  key: string | null | undefined,
): MoneyCategoryPick | null {
  if (!key) return null;
  if (key.startsWith("b:")) {
    const n = Number(key.slice(2));
    if (
      typeof n === "number" &&
      Number.isInteger(n) &&
      (MONEY_CATEGORIES as readonly number[]).includes(n)
    ) {
      return { kind: "builtin", category: n as MoneyCategory };
    }
    return null;
  }
  if (key.startsWith("u:") && key.length > 2) {
    return { kind: "custom", userCategoryId: key.slice(2) };
  }
  return null;
}

export function moneyCategoryPickFromTx(tx: {
  category: MoneyCategory | null;
  userCategoryId?: string | null;
}): MoneyCategoryPick | null {
  if (tx.userCategoryId) {
    return { kind: "custom", userCategoryId: tx.userCategoryId };
  }
  if (tx.category != null) {
    return { kind: "builtin", category: tx.category };
  }
  return null;
}

export function defaultCategoryForDirection(
  direction: MoneyDirectionValue,
): MoneyCategory {
  return direction === MoneyDirection.In
    ? MoneyCategory.Income
    : MoneyCategory.Food;
}

export function defaultCategoryPickForDirection(
  direction: MoneyDirectionValue,
): MoneyCategoryPick {
  return {
    kind: "builtin",
    category: defaultCategoryForDirection(direction),
  };
}

/**
 * When the user flips In/Out, nudge an obviously mismatched category
 * (Income ↔ expense) without fighting Transfer/Other.
 * Custom picks are left alone (filtered by dropdown mode).
 */
export function coerceCategoryForDirection(
  category: MoneyCategory,
  direction: MoneyDirectionValue,
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

export function coerceCategoryPickForDirection(
  pick: MoneyCategoryPick,
  direction: MoneyDirectionValue,
): MoneyCategoryPick {
  if (pick.kind === "custom") return pick;
  return {
    kind: "builtin",
    category: coerceCategoryForDirection(pick.category, direction),
  };
}

export function isMoneyCategory(value: unknown): value is MoneyCategory {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    (MONEY_CATEGORIES as readonly number[]).includes(value)
  );
}

export function toMoneyCategory(value: unknown): MoneyCategory {
  return isMoneyCategory(value) ? value : MoneyCategory.Other;
}
