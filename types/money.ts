/**
 * Money module — expense ledger, budgets, and savings goals.
 *
 * Amounts are integer **minor units** of the user currency.
 * Never store fractional minor units. Direction is a separate integer enum so
 * `amountMinor` is always ≥ 0.
 *
 * Explicit named re-exports only (no `export *`) — same policy as
 * `server/utils/db.ts`. Const+type pairs (e.g. `MoneyDirection`) are re-exported
 * once as values so TypeScript preserves both the runtime object and the type.
 */

export {
  MoneyDirection,
  MONEY_DIRECTIONS,
  isMoneyDirection,
  toMoneyDirection,
} from "./money/direction";

export {
  MoneyCategory,
  MONEY_CATEGORIES,
  MONEY_CATEGORY_I18N_KEYS,
  MONEY_CATEGORY_COLORS,
  MONEY_CATEGORY_EMOJI,
  MONEY_EXPENSE_CATEGORIES,
  MONEY_USER_CATEGORY_COLORS,
  MONEY_USER_CATEGORY_EMOJI_SUGGESTIONS,
  moneyCategoryKey,
  parseMoneyCategoryKey,
  moneyCategoryPickFromTx,
  defaultCategoryForDirection,
  defaultCategoryPickForDirection,
  coerceCategoryForDirection,
  coerceCategoryPickForDirection,
  isMoneyCategory,
  toMoneyCategory,
  type MoneyUserCategory,
  type MoneyCategoryPick,
} from "./money/categories";

export {
  MoneyCurrency,
  MONEY_CURRENCIES,
  MONEY_CURRENCY_CODE,
  MONEY_CURRENCY_FRACTION_DIGITS,
  MONEY_CURRENCY_I18N_KEYS,
  MONEY_CURRENCY,
  isMoneyCurrency,
  toMoneyCurrency,
} from "./money/currency";

export type { MoneyTransaction, MoneyMonthTotals } from "./money/transaction";

export {
  MoneySavingsGoalStatus,
  MONEY_SAVINGS_GOAL_STATUSES,
  MONEY_SAVINGS_GOAL_STATUS_I18N_KEYS,
  isMoneySavingsGoalStatus,
  toMoneySavingsGoalStatus,
  savingsProgress,
  type MoneySavingsContribution,
  type MoneySavingsGoal,
} from "./money/savings";

export {
  MoneyBudgetScope,
  MONEY_BUDGET_SCOPES,
  isMoneyBudgetScope,
  toMoneyBudgetScope,
  budgetProgress,
  type MoneyBudget,
  type MoneyBudgetsMonth,
} from "./money/budgets";
