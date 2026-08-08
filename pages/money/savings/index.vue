<script setup lang="ts">
import {
  type MoneySavingsContribution,
  type MoneySavingsGoal,
} from "~/types/money";
import { formatMoneyMinor } from "~/utils/money";

const { t } = useI18n();
const { currency, intlLocale } = useMoneyCurrency();
const {
  goals,
  isLoading,
  error,
  fetchGoals,
  fetchContributions,
  deleteContribution,
} = useMoneySavings();
const { pushToast } = useToasts();
const { exportSavingsCsv, exportSavingsJson } = useMoneyExport();

const goalModalOpen = ref(false);
const contributeOpen = ref(false);
const editingGoal = ref<MoneySavingsGoal | null>(null);
const contributeGoal = ref<MoneySavingsGoal | null>(null);
const expandedId = ref<string | null>(null);
const contributions = ref<MoneySavingsContribution[]>([]);
const contribNextCursor = ref<string | null>(null);
const contribLoading = ref(false);
const contribLoadingMore = ref(false);

await useAsyncData("money:savings:initial", async () => {
  await fetchGoals();
  return { ok: true };
});

useSeoMeta({
  title: () => t("seo.moneySavings"),
  description: () => t("seo.moneySavingsDescription"),
  robots: "noindex, nofollow",
});

usePageShortcuts([{ key: "n", handler: () => openCreate() }]);

const moneyLocale = intlLocale;

function fmt(amount: number) {
  return formatMoneyMinor(amount, moneyLocale.value, currency.value);
}

function openCreate() {
  editingGoal.value = null;
  goalModalOpen.value = true;
}

function openEdit(goal: MoneySavingsGoal) {
  editingGoal.value = goal;
  goalModalOpen.value = true;
}

function openContribute(goal: MoneySavingsGoal) {
  contributeGoal.value = goal;
  contributeOpen.value = true;
}

async function toggleExpand(goal: MoneySavingsGoal) {
  if (expandedId.value === goal.id) {
    expandedId.value = null;
    contributions.value = [];
    contribNextCursor.value = null;
    return;
  }
  expandedId.value = goal.id;
  contribLoading.value = true;
  contribNextCursor.value = null;
  try {
    const res = await fetchContributions(goal.id);
    contributions.value = res.contributions ?? [];
    contribNextCursor.value = res.nextCursor ?? null;
  } catch (err: unknown) {
    pushToast(
      err instanceof Error
        ? err.message
        : t("toasts.failedToLoadContributions"),
      { tone: "danger" },
    );
    expandedId.value = null;
  } finally {
    contribLoading.value = false;
  }
}

async function loadMoreContributions() {
  const goalId = expandedId.value;
  const cursor = contribNextCursor.value;
  if (!goalId || !cursor || contribLoadingMore.value) return;
  contribLoadingMore.value = true;
  try {
    const res = await fetchContributions(goalId, { cursor });
    contributions.value = [
      ...contributions.value,
      ...(res.contributions ?? []),
    ];
    contribNextCursor.value = res.nextCursor ?? null;
  } catch (err: unknown) {
    pushToast(
      err instanceof Error
        ? err.message
        : t("toasts.failedToLoadContributions"),
      { tone: "danger" },
    );
  } finally {
    contribLoadingMore.value = false;
  }
}

async function onDeleteContribution(id: string) {
  try {
    await deleteContribution(id);
    contributions.value = contributions.value.filter((c) => c.id !== id);
    pushToast(t("toasts.contributionDeleted"), { tone: "info" });
  } catch (err: unknown) {
    pushToast(
      err instanceof Error
        ? err.message
        : t("toasts.failedToDeleteContribution"),
      { tone: "danger" },
    );
  }
}

function onGoalSaved() {
  goalModalOpen.value = false;
  pushToast(t("toasts.savingsGoalSaved"), { tone: "success" });
}

async function onContributed() {
  pushToast(t("toasts.contributionSaved"), { tone: "success" });
  if (expandedId.value && contributeGoal.value) {
    const res = await fetchContributions(contributeGoal.value.id);
    contributions.value = res.contributions ?? [];
    contribNextCursor.value = res.nextCursor ?? null;
  }
}

function onExportCsv() {
  exportSavingsCsv(goals.value);
  pushToast(t("toasts.moneyExported"), { tone: "success" });
}

function onExportJson() {
  exportSavingsJson(goals.value);
  pushToast(t("toasts.moneyExported"), { tone: "success" });
}
</script>

<template>
  <div class="money-shell relative flex min-h-0 flex-1 flex-col">
    <MoneySavingsPageHeader
      :export-disabled="isLoading || goals.length === 0"
      @export-csv="onExportCsv"
      @export-json="onExportJson"
      @create="openCreate"
    />

    <div class="relative z-0 flex-1 overflow-y-auto scrollbar-thin">
      <div class="mx-auto max-w-3xl space-y-4 px-4 py-6 md:px-6">
        <InlineErrorAlert
          v-if="error"
          :message="error"
          :retry-label="$t('common.retry')"
          @retry="fetchGoals()"
        />
        <div
          v-else-if="isLoading && !goals.length"
          class="rounded-xl bg-white/70 p-2"
          :aria-busy="true"
          :aria-label="$t('money.savings.loading')"
        >
          <SkeletonList :rows="3" variant="card" />
        </div>
        <EmptyState
          v-else-if="!goals.length"
          illustration="spark"
          :title="$t('money.savings.empty')"
          :description="$t('money.savings.emptyHint')"
          :primary-label="$t('money.savings.addGoal')"
          primary-shortcut="N"
          @primary="openCreate"
        />

        <MoneySavingsGoalCard
          v-for="goal in goals"
          :key="goal.id"
          :goal="goal"
          :expanded="expandedId === goal.id"
          :contributions="expandedId === goal.id ? contributions : []"
          :contrib-loading="expandedId === goal.id && contribLoading"
          :contrib-next-cursor="
            expandedId === goal.id ? contribNextCursor : null
          "
          :contrib-loading-more="contribLoadingMore"
          :fmt="fmt"
          @contribute="openContribute(goal)"
          @edit="openEdit(goal)"
          @toggle-expand="toggleExpand(goal)"
          @delete-contribution="onDeleteContribution"
          @load-more-contributions="loadMoreContributions"
        />
      </div>
    </div>

    <LazyMoneySavingsGoalModal
      :open="goalModalOpen"
      :goal="editingGoal"
      @close="goalModalOpen = false"
      @saved="onGoalSaved"
      @deleted="goalModalOpen = false"
    />
    <LazyMoneyContributeModal
      :open="contributeOpen"
      :goal="contributeGoal"
      @close="contributeOpen = false"
      @saved="onContributed"
    />
  </div>
</template>
