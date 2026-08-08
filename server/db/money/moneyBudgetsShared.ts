/**
 * Shared row shape + mappers for money budgets.
 */
import type { RowDataPacket } from "mysql2/promise";
import { DomainError } from "~/server/utils/http";
import {
  MoneyBudgetScope,
  budgetProgress,
  toMoneyBudgetScope,
  toMoneyCategory,
  type MoneyBudget,
  type MoneyBudgetScope as MoneyBudgetScopeT,
  type MoneyCategory,
} from "~/types/money";
import { dbToISO } from "../core/datetime";

export interface BudgetRow extends RowDataPacket {
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

export interface UpsertMoneyBudgetInput {
  id?: string;
  yearMonth: string;
  scope: MoneyBudgetScopeT;
  category?: MoneyCategory | null;
  userCategoryId?: string | null;
  amountMinor: number;
}

export function rowToBudget(
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

export function spentForBudget(
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

export function resolveBudgetCategory(input: UpsertMoneyBudgetInput): {
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
  throw new DomainError(400, "Category budget requires category");
}
