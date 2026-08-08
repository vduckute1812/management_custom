import type { z } from "zod";
import {
  deleteMoneyTransaction,
  getMoneyTransactionById,
  listMoneyTransactions,
  sumMoneyMonth,
  upsertMoneyTransaction,
} from "~/server/db/money/money";
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
  totals?: MoneyMonthTotals;
  nextCursor: string | null;
}> {
  const yearMonth = resolveYearMonth(query.yearMonth);
  const range = yearMonthRange(yearMonth);
  const pagePromise = listMoneyTransactions(userId, range, {
    limit: query.limit,
    cursor: query.cursor,
  });
  if (query.cursor) return pagePromise;

  const [page, sums] = await Promise.all([
    pagePromise,
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
  return upsertMoneyTransaction(userId, {
    id: body.id,
    occurredOn: body.occurredOn,
    amountMinor: body.amountMinor,
    direction: body.direction,
    category: body.category,
    userCategoryId: body.userCategoryId,
    note: body.note,
  });
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
