<script setup lang="ts">
import {
  MONEY_SAVINGS_GOAL_STATUS_I18N_KEYS,
  MoneySavingsGoalStatus,
  type MoneySavingsContribution,
  type MoneySavingsGoal,
} from "~/types/money";
import { formatMoneyMinor } from "~/utils/money";

const { t, locale } = useI18n();
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
const contribLoading = ref(false);

await useAsyncData("money:savings:initial", async () => {
  await fetchGoals();
  return { ok: true };
});

useSeoMeta({
  title: () => t("seo.moneySavings"),
  description: () => t("seo.moneySavingsDescription"),
});

usePageShortcuts([{ key: "n", handler: () => openCreate() }]);

const moneyLocale = computed(() => {
  const map: Record<string, string> = {
    en: "en-US",
    vi: "vi-VN",
    "zh-CN": "zh-CN",
    "zh-TW": "zh-TW",
  };
  return map[locale.value] ?? "vi-VN";
});

function fmt(amount: number) {
  return formatMoneyMinor(amount, moneyLocale.value);
}

function progressPct(goal: MoneySavingsGoal) {
  return Math.min(100, Math.round(goal.progress * 100));
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
    return;
  }
  expandedId.value = goal.id;
  contribLoading.value = true;
  try {
    const res = await fetchContributions(goal.id);
    contributions.value = res.contributions ?? [];
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
  }
}

const statusTone: Record<MoneySavingsGoalStatus, string> = {
  [MoneySavingsGoalStatus.Active]: "bg-sky-50 text-sky-700 ring-sky-100",
  [MoneySavingsGoalStatus.Completed]:
    "bg-emerald-50 text-emerald-700 ring-emerald-100",
  [MoneySavingsGoalStatus.Archived]:
    "bg-slate-100 text-slate-600 ring-slate-200",
};

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
  <div class="flex h-screen flex-col">
    <header
      class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-4 md:px-6"
    >
      <div>
        <h1 class="text-xl font-semibold text-slate-900">
          {{ $t("money.savings.title") }}
        </h1>
        <p class="mt-0.5 text-xs text-slate-500">
          {{ $t("money.savings.subtitle") }}
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <MoneyExportMenu
          :disabled="isLoading || goals.length === 0"
          @csv="onExportCsv"
          @json="onExportJson"
        />
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-700"
          @click="openCreate"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="h-3.5 w-3.5"
          >
            <path d="M12 5v14M5 12h14" stroke-linecap="round" />
          </svg>
          {{ $t("money.savings.addGoal") }}
        </button>
      </div>
    </header>

    <div class="flex-1 overflow-y-auto scrollbar-thin">
      <div class="mx-auto max-w-3xl space-y-4 px-4 py-6 md:px-6">
        <p v-if="error" class="text-sm text-rose-600" role="alert">
          {{ error }}
        </p>
        <p
          v-else-if="isLoading && !goals.length"
          class="text-sm text-slate-500"
        >
          {{ $t("money.savings.loading") }}
        </p>
        <p
          v-else-if="!goals.length"
          class="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 ring-1 ring-slate-200"
        >
          {{ $t("money.savings.empty") }}
        </p>

        <article
          v-for="goal in goals"
          :key="goal.id"
          class="rounded-xl bg-white ring-1 ring-slate-200"
        >
          <div class="px-4 py-4 sm:px-5">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <h2 class="text-base font-semibold text-slate-900">
                    {{ goal.title }}
                  </h2>
                  <span
                    class="rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1"
                    :class="statusTone[goal.status]"
                  >
                    {{ $t(MONEY_SAVINGS_GOAL_STATUS_I18N_KEYS[goal.status]) }}
                  </span>
                </div>
                <p class="mt-1 text-xs text-slate-500">
                  {{ fmt(goal.savedMinor) }}
                  /
                  {{ fmt(goal.targetMinor) }}
                  <span v-if="goal.targetDate">
                    ·
                    {{ $t("money.savings.byDate", { date: goal.targetDate }) }}
                  </span>
                </p>
              </div>
              <div class="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  class="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                  @click="openContribute(goal)"
                >
                  {{ $t("money.savings.contributeAction") }}
                </button>
                <button
                  type="button"
                  class="rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                  @click="openEdit(goal)"
                >
                  {{ $t("money.savings.edit") }}
                </button>
                <button
                  type="button"
                  class="rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                  @click="toggleExpand(goal)"
                >
                  {{
                    expandedId === goal.id
                      ? $t("money.savings.hideContributions")
                      : $t("money.savings.showContributions")
                  }}
                </button>
              </div>
            </div>

            <div class="mt-3">
              <div
                class="h-2 overflow-hidden rounded-full bg-slate-100"
                role="progressbar"
                :aria-valuenow="progressPct(goal)"
                aria-valuemin="0"
                aria-valuemax="100"
                :aria-label="
                  $t('money.savings.progressAria', { pct: progressPct(goal) })
                "
              >
                <div
                  class="h-full rounded-full transition-all"
                  :class="
                    goal.status === MoneySavingsGoalStatus.Completed
                      ? 'bg-emerald-500'
                      : 'bg-brand-500'
                  "
                  :style="{ width: `${progressPct(goal)}%` }"
                />
              </div>
              <p
                class="mt-1 text-right text-[11px] tabular-nums text-slate-500"
              >
                {{ progressPct(goal) }}%
              </p>
            </div>
            <p v-if="goal.note" class="mt-2 text-xs text-slate-500">
              {{ goal.note }}
            </p>
          </div>

          <div
            v-if="expandedId === goal.id"
            class="border-t border-slate-100 bg-slate-50/60 px-4 py-3 sm:px-5"
          >
            <p v-if="contribLoading" class="text-xs text-slate-500">
              {{ $t("money.savings.loading") }}
            </p>
            <p v-else-if="!contributions.length" class="text-xs text-slate-500">
              {{ $t("money.savings.noContributions") }}
            </p>
            <ul v-else class="divide-y divide-slate-200/80">
              <li
                v-for="c in contributions"
                :key="c.id"
                class="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <div class="min-w-0">
                  <p class="tabular-nums font-medium text-slate-800">
                    +{{ fmt(c.amountMinor) }}
                  </p>
                  <p class="text-xs text-slate-400">
                    {{ c.occurredOn }}
                    <span v-if="c.note"> · {{ c.note }}</span>
                  </p>
                </div>
                <button
                  type="button"
                  class="text-xs font-semibold text-rose-600 hover:text-rose-700"
                  @click="onDeleteContribution(c.id)"
                >
                  {{ $t("money.savings.deleteContribution") }}
                </button>
              </li>
            </ul>
          </div>
        </article>
      </div>
    </div>

    <MoneySavingsGoalModal
      :open="goalModalOpen"
      :goal="editingGoal"
      @close="goalModalOpen = false"
      @saved="onGoalSaved"
      @deleted="goalModalOpen = false"
    />
    <MoneyContributeModal
      :open="contributeOpen"
      :goal="contributeGoal"
      @close="contributeOpen = false"
      @saved="onContributed"
    />
  </div>
</template>
