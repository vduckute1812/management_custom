import { describe, expect, it } from "vitest";
import * as money from "../types/money";

const EXPECTED_VALUE_KEYS = [
  "MoneyDirection",
  "MONEY_DIRECTIONS",
  "isMoneyDirection",
  "toMoneyDirection",
  "MoneyCategory",
  "MONEY_CATEGORIES",
  "MONEY_CATEGORY_I18N_KEYS",
  "MONEY_CATEGORY_COLORS",
  "MONEY_CATEGORY_EMOJI",
  "MONEY_EXPENSE_CATEGORIES",
  "MONEY_USER_CATEGORY_COLORS",
  "MONEY_USER_CATEGORY_EMOJI_SUGGESTIONS",
  "moneyCategoryKey",
  "parseMoneyCategoryKey",
  "moneyCategoryPickFromTx",
  "defaultCategoryForDirection",
  "defaultCategoryPickForDirection",
  "coerceCategoryForDirection",
  "coerceCategoryPickForDirection",
  "isMoneyCategory",
  "toMoneyCategory",
  "MoneyCurrency",
  "MONEY_CURRENCIES",
  "MONEY_CURRENCY_CODE",
  "MONEY_CURRENCY_FRACTION_DIGITS",
  "MONEY_CURRENCY_I18N_KEYS",
  "MONEY_CURRENCY",
  "isMoneyCurrency",
  "toMoneyCurrency",
  "MoneySavingsGoalStatus",
  "MONEY_SAVINGS_GOAL_STATUSES",
  "MONEY_SAVINGS_GOAL_STATUS_I18N_KEYS",
  "isMoneySavingsGoalStatus",
  "toMoneySavingsGoalStatus",
  "savingsProgress",
  "MoneyBudgetScope",
  "MONEY_BUDGET_SCOPES",
  "isMoneyBudgetScope",
  "toMoneyBudgetScope",
  "budgetProgress",
] as const;

describe("types/money public surface", () => {
  it("has no export * leftovers (explicit allowlist only)", () => {
    expect(Object.keys(money).sort()).toEqual([...EXPECTED_VALUE_KEYS].sort());
  });

  it("keeps integer enum consts usable at runtime", () => {
    expect(money.MoneyDirection.Out).toBe(0);
    expect(money.MoneyDirection.In).toBe(1);
    expect(typeof money.toMoneyCategory).toBe("function");
    expect(typeof money.budgetProgress).toBe("function");
  });
});
