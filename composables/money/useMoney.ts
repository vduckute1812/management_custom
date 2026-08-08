import { type MoneyMonthTotals, type MoneyTransaction } from "~/types/money";
import { toYearMonth } from "~/utils/money";

interface ListResponse {
  transactions: MoneyTransaction[];
  totals?: MoneyMonthTotals;
  nextCursor: string | null;
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
  const nextCursor = useState<string | null>("money:nextCursor", () => null);
  const isLoading = useState<boolean>("money:loading", () => false);
  const isLoadingMore = useState<boolean>("money:loadingMore", () => false);
  const error = useState<string | null>("money:error", () => null);
  const { apiFetch } = useApi();
  const { t } = useI18n();

  async function fetchMonth(ym?: string) {
    const target = ym ?? yearMonth.value;
    isLoading.value = true;
    error.value = null;
    try {
      const data = await apiFetch<ListResponse>("/api/money/transactions", {
        query: { yearMonth: target, limit: 100 },
      });
      yearMonth.value = data.totals?.yearMonth ?? target;
      transactions.value = data.transactions ?? [];
      totals.value = data.totals ?? null;
      nextCursor.value = data.nextCursor ?? null;
    } catch (err: unknown) {
      error.value =
        err instanceof Error ? err.message : t("toasts.failedToLoadMoney");
    } finally {
      isLoading.value = false;
    }
  }

  async function loadMore() {
    const cursor = nextCursor.value;
    const target = yearMonth.value;
    if (!cursor || isLoadingMore.value) return;
    isLoadingMore.value = true;
    error.value = null;
    try {
      const data = await apiFetch<ListResponse>("/api/money/transactions", {
        query: { yearMonth: target, limit: 100, cursor },
      });
      if (yearMonth.value !== target) return;
      const seen = new Set(transactions.value.map((row) => row.id));
      transactions.value = [
        ...transactions.value,
        ...data.transactions.filter((row) => !seen.has(row.id)),
      ];
      if (data.totals) totals.value = data.totals;
      nextCursor.value = data.nextCursor ?? null;
    } catch (err: unknown) {
      error.value =
        err instanceof Error ? err.message : t("toasts.failedToLoadMoney");
    } finally {
      isLoadingMore.value = false;
    }
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
    const viewing = yearMonth.value;
    await fetchMonth(viewing);
    return tx;
  }

  async function deleteTransaction(id: string) {
    await apiFetch(`/api/money/transactions/${id}`, { method: "DELETE" });
    await fetchMonth(yearMonth.value);
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
    nextCursor,
    isLoading,
    isLoadingMore,
    error,
    fetchMonth,
    loadMore,
    saveTransaction,
    deleteTransaction,
    shiftMonth,
  };
};
