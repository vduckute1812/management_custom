import type { MoneySavingsContribution, MoneySavingsGoal } from "~/types/money";

interface GoalsResponse {
  goals: MoneySavingsGoal[];
}

interface GoalSaveResponse {
  goal: MoneySavingsGoal;
  created: boolean;
}

interface ContributionsResponse {
  contributions: MoneySavingsContribution[];
  goal: MoneySavingsGoal;
}

interface ContributionSaveResponse {
  contribution: MoneySavingsContribution;
  goal: MoneySavingsGoal;
}

export const useMoneySavings = () => {
  const goals = useState<MoneySavingsGoal[]>("money:savings:goals", () => []);
  const isLoading = useState<boolean>("money:savings:loading", () => false);
  const error = useState<string | null>("money:savings:error", () => null);
  const { apiFetch } = useApi();
  const { t } = useI18n();

  async function fetchGoals() {
    isLoading.value = true;
    error.value = null;
    try {
      const data = await apiFetch<GoalsResponse>("/api/money/savings/goals");
      goals.value = data.goals ?? [];
    } catch (err: unknown) {
      error.value =
        err instanceof Error ? err.message : t("toasts.failedToLoadSavings");
    } finally {
      isLoading.value = false;
    }
  }

  async function saveGoal(
    payload: Partial<MoneySavingsGoal> & {
      title: string;
      targetMinor: number;
    },
  ) {
    const data = await apiFetch<GoalSaveResponse>("/api/money/savings/goals", {
      method: "POST",
      body: {
        id: payload.id,
        title: payload.title,
        targetMinor: payload.targetMinor,
        status: payload.status,
        targetDate: payload.targetDate ?? null,
        note: payload.note ?? null,
      },
    });
    await fetchGoals();
    return data.goal;
  }

  async function deleteGoal(id: string) {
    await apiFetch(`/api/money/savings/goals/${id}`, { method: "DELETE" });
    goals.value = goals.value.filter((g) => g.id !== id);
  }

  async function fetchContributions(goalId: string) {
    return apiFetch<ContributionsResponse>(
      `/api/money/savings/goals/${goalId}/contributions`,
    );
  }

  async function addContribution(
    goalId: string,
    payload: {
      occurredOn: string;
      amountMinor: number;
      note?: string | null;
    },
  ) {
    const data = await apiFetch<ContributionSaveResponse>(
      `/api/money/savings/goals/${goalId}/contributions`,
      {
        method: "POST",
        body: payload,
      },
    );
    await fetchGoals();
    return data;
  }

  async function deleteContribution(id: string) {
    await apiFetch(`/api/money/savings/contributions/${id}`, {
      method: "DELETE",
    });
    await fetchGoals();
  }

  return {
    goals,
    isLoading,
    error,
    fetchGoals,
    saveGoal,
    deleteGoal,
    fetchContributions,
    addContribution,
    deleteContribution,
  };
};
