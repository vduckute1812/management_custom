import type { z } from "zod";
import {
  copyMoneyBudgetsFromMonth,
  deleteMoneyBudget,
  getMoneyBudgetById,
  listMoneyBudgets,
  upsertMoneyBudget,
} from "~/server/db/moneyBudgets";
import { DomainError } from "~/server/utils/http";
import type {
  moneyBudgetUpsertBodySchema,
  moneyBudgetsCopyBodySchema,
  moneyBudgetsQuerySchema,
} from "~/server/schemas";
import type { MoneyBudget, MoneyBudgetsMonth } from "~/types/money";
import { isYearMonth, toYearMonth } from "~/utils/money";

type ListQuery = z.infer<typeof moneyBudgetsQuerySchema>;
type UpsertBody = z.infer<typeof moneyBudgetUpsertBodySchema>;
type CopyBody = z.infer<typeof moneyBudgetsCopyBodySchema>;

function resolveYearMonth(raw: string | undefined): string {
  if (raw && isYearMonth(raw)) return raw;
  return toYearMonth(new Date());
}

export async function listMoneyBudgetsForUser(
  userId: string,
  query: ListQuery,
): Promise<MoneyBudgetsMonth> {
  const yearMonth = resolveYearMonth(query.yearMonth);
  return listMoneyBudgets(userId, yearMonth);
}

export async function upsertMoneyBudgetForUser(
  userId: string,
  body: UpsertBody,
): Promise<{ budget: MoneyBudget; created: boolean }> {
  try {
    return await upsertMoneyBudget(userId, {
      id: body.id,
      yearMonth: body.yearMonth,
      scope: body.scope,
      category: body.category,
      amountMinor: body.amountMinor,
    });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === "NOT_FOUND") {
      throw new DomainError(404, "Budget not found");
    }
    if (code === "CATEGORY_REQUIRED") {
      throw new DomainError(400, "Category budget requires category");
    }
    if (code === "CONFLICT") {
      throw new DomainError(409, "Budget already exists for this slot");
    }
    throw err;
  }
}

export async function deleteMoneyBudgetForUser(
  userId: string,
  id: string,
): Promise<void> {
  const existing = await getMoneyBudgetById(userId, id);
  if (!existing) {
    throw new DomainError(404, "Budget not found");
  }
  await deleteMoneyBudget(userId, id);
}

export async function copyMoneyBudgetsForUser(
  userId: string,
  body: CopyBody,
): Promise<{ copied: number; yearMonth: string }> {
  if (body.fromYearMonth === body.toYearMonth) {
    throw new DomainError(400, "fromYearMonth and toYearMonth must differ");
  }
  const copied = await copyMoneyBudgetsFromMonth(
    userId,
    body.fromYearMonth,
    body.toYearMonth,
  );
  return { copied, yearMonth: body.toYearMonth };
}
