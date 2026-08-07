import type { z } from "zod";
import {
  deleteMoneyTransaction,
  getMoneyTransactionById,
  listMoneyTransactions,
  sumMoneyMonth,
  upsertMoneyTransaction,
} from "~/server/db/money";
import { DomainError } from "~/server/utils/http";
import type {
  moneyTransactionUpsertBodySchema,
  moneyTransactionsQuerySchema,
} from "~/server/schemas";
import { isYearMonth, toYearMonth, yearMonthRange } from "~/utils/money";
import type { MoneyMonthTotals, MoneyTransaction } from "~/types/money";

type ListQuery = z.infer<typeof moneyTransactionsQuerySchema>;
type UpsertBody = z.infer<typeof moneyTransactionUpsertBodySchema>;

function resolveYearMonth(raw: string | undefined): string {
  if (raw && isYearMonth(raw)) return raw;
  return toYearMonth(new Date());
}

export async function listMoneyTransactionsForUser(
  userId: string,
  query: ListQuery,
): Promise<{
  transactions: MoneyTransaction[];
  totals: MoneyMonthTotals;
  nextCursor: string | null;
}> {
  const yearMonth = resolveYearMonth(query.yearMonth);
  const range = yearMonthRange(yearMonth);
  const [page, sums] = await Promise.all([
    listMoneyTransactions(userId, range, {
      limit: query.limit,
      cursor: query.cursor,
    }),
    sumMoneyMonth(userId, range),
  ]);
  return {
    ...page,
    totals: { yearMonth, ...sums },
  };
}

export async function upsertMoneyTransactionForUser(
  userId: string,
  body: UpsertBody,
): Promise<{ transaction: MoneyTransaction; created: boolean }> {
  try {
    return await upsertMoneyTransaction(userId, {
      id: body.id,
      occurredOn: body.occurredOn,
      amountMinor: body.amountMinor,
      direction: body.direction,
      category: body.category,
      userCategoryId: body.userCategoryId,
      note: body.note,
    });
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === "NOT_FOUND") {
      throw new DomainError(404, "Transaction not found");
    }
    if (code === "CATEGORY_REQUIRED") {
      throw new DomainError(400, "Provide category or userCategoryId");
    }
    if (code === "USER_CATEGORY_NOT_FOUND") {
      throw new DomainError(404, "Category not found");
    }
    throw err;
  }
}

export async function deleteMoneyTransactionForUser(
  userId: string,
  id: string,
): Promise<void> {
  const existing = await getMoneyTransactionById(userId, id);
  if (!existing) {
    throw new DomainError(404, "Transaction not found");
  }
  await deleteMoneyTransaction(userId, id);
}
