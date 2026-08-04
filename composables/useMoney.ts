import { type MoneyMonthTotals, type MoneyTransaction } from "~/types/money";
import {
  computeMonthTotals,
  toYearMonth,
  upsertTransactionInMonth,
  yearMonthFromOccurredOn,
} from "~/utils/money";

interface ListResponse {
  transactions: MoneyTransaction[];
  totals: MoneyMonthTotals;
}

interface SaveResponse {
  transaction: MoneyTransaction;
  created: boolean;
}

export const useMoney = () => {
  const transactions = useState<MoneyTransaction[]>("money:tx", () => []);
  const totals = useState<MoneyMonthTotals | null>("money:totals", () => null);
  const yearMonth = useState<string>("money:yearMonth", () =>
    toYearMonth(new Date()),
  );
  const isLoading = useState<boolean>("money:loading", () => false);
  const error = useState<string | null>("money:error", () => null);
  const { apiFetch } = useApi();
  const { t } = useI18n();

  async function fetchMonth(ym?: string) {
    const target = ym ?? yearMonth.value;
    isLoading.value = true;
    error.value = null;
    try {
      const data = await apiFetch<ListResponse>("/api/money/transactions", {
        query: { yearMonth: target },
      });
      yearMonth.value = data.totals?.yearMonth ?? target;
      transactions.value = data.transactions ?? [];
      totals.value = data.totals ?? null;
    } catch (err: unknown) {
      error.value =
        err instanceof Error ? err.message : t("toasts.failedToLoadMoney");
    } finally {
      isLoading.value = false;
    }
  }

  function applyLocalList(next: MoneyTransaction[]) {
    transactions.value = next;
    totals.value = computeMonthTotals(next, yearMonth.value);
  }

  async function saveTransaction(
    payload: Partial<MoneyTransaction> & {
      occurredOn: string;
      amountMinor: number;
      direction: MoneyTransaction["direction"];
      category?: MoneyTransaction["category"];
      userCategoryId?: string | null;
    },
  ) {
    const data = await apiFetch<SaveResponse>("/api/money/transactions", {
      method: "POST",
      body: {
        id: payload.id,
        occurredOn: payload.occurredOn,
        amountMinor: payload.amountMinor,
        direction: payload.direction,
        category: payload.userCategoryId ? null : payload.category,
        userCategoryId: payload.userCategoryId ?? null,
        note: payload.note ?? null,
      },
    });
    const tx = data.transaction;
    const txYm = yearMonthFromOccurredOn(tx.occurredOn);
    const viewing = yearMonth.value;
    const without = transactions.value.filter((row) => row.id !== tx.id);

    if (txYm === viewing) {
      applyLocalList(upsertTransactionInMonth(without, tx));
    } else if (without.length !== transactions.value.length) {
      // Edited out of the current month — drop from the open list.
      applyLocalList(without);
    }
    return tx;
  }

  async function deleteTransaction(id: string) {
    await apiFetch(`/api/money/transactions/${id}`, { method: "DELETE" });
    const next = transactions.value.filter((row) => row.id !== id);
    if (next.length !== transactions.value.length) {
      applyLocalList(next);
    }
  }

  function shiftMonth(delta: number) {
    const [ys, ms] = yearMonth.value.split("-").map(Number);
    const d = new Date(ys!, ms! - 1 + delta, 1);
    return toYearMonth(d);
  }

  return {
    transactions,
    totals,
    yearMonth,
    isLoading,
    error,
    fetchMonth,
    saveTransaction,
    deleteTransaction,
    shiftMonth,
  };
};
