import type {
  MoneyBudget,
  MoneyBudgetScope,
  MoneyBudgetsMonth,
  MoneyCategory,
} from "~/types/money";
import { toYearMonth } from "~/utils/money";

interface SaveResponse {
  budget: MoneyBudget;
  created: boolean;
}

interface CopyResponse {
  copied: number;
  yearMonth: string;
}

export const useMoneyBudgets = () => {
  const month = useState<MoneyBudgetsMonth | null>(
    "money:budgets:month",
    () => null,
  );
  const yearMonth = useState<string>("money:budgets:yearMonth", () =>
    toYearMonth(new Date()),
  );
  const isLoading = useState<boolean>("money:budgets:loading", () => false);
  const error = useState<string | null>("money:budgets:error", () => null);
  const { apiFetch } = useApi();
  const { t } = useI18n();

  async function fetchMonth(ym?: string) {
    const target = ym ?? yearMonth.value;
    isLoading.value = true;
    error.value = null;
    try {
      const data = await apiFetch<MoneyBudgetsMonth>("/api/money/budgets", {
        query: { yearMonth: target },
      });
      yearMonth.value = data.yearMonth ?? target;
      month.value = data;
    } catch (err: unknown) {
      error.value =
        err instanceof Error ? err.message : t("toasts.failedToLoadBudgets");
    } finally {
      isLoading.value = false;
    }
  }

  async function saveBudget(payload: {
    id?: string;
    yearMonth: string;
    scope: MoneyBudgetScope;
    category?: MoneyCategory | null;
    userCategoryId?: string | null;
    amountMinor: number;
  }) {
    const data = await apiFetch<SaveResponse>("/api/money/budgets", {
      method: "POST",
      body: {
        id: payload.id,
        yearMonth: payload.yearMonth,
        scope: payload.scope,
        category: payload.userCategoryId ? null : (payload.category ?? null),
        userCategoryId: payload.userCategoryId ?? null,
        amountMinor: payload.amountMinor,
      },
    });
    await fetchMonth(payload.yearMonth);
    return data.budget;
  }

  async function deleteBudget(id: string) {
    await apiFetch(`/api/money/budgets/${id}`, { method: "DELETE" });
    await fetchMonth(yearMonth.value);
  }

  async function copyFromPrevious() {
    const [ys, ms] = yearMonth.value.split("-").map(Number);
    const prev = toYearMonth(new Date(ys!, ms! - 2, 1));
    const data = await apiFetch<CopyResponse>("/api/money/budgets/copy", {
      method: "POST",
      body: { fromYearMonth: prev, toYearMonth: yearMonth.value },
    });
    await fetchMonth(yearMonth.value);
    return data.copied;
  }

  function shiftMonth(delta: number) {
    const [ys, ms] = yearMonth.value.split("-").map(Number);
    return toYearMonth(new Date(ys!, ms! - 1 + delta, 1));
  }

  return {
    month,
    yearMonth,
    isLoading,
    error,
    fetchMonth,
    saveBudget,
    deleteBudget,
    copyFromPrevious,
    shiftMonth,
  };
};
