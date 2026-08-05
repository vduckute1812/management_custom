<script setup lang="ts">
import {
  MONEY_CATEGORY_COLORS,
  MONEY_CATEGORY_EMOJI,
  MONEY_CATEGORY_I18N_KEYS,
  MoneyBudgetScope,
  type MoneyBudget,
} from "~/types/money";
import { formatMoneyMinor, toYearMonth } from "~/utils/money";

const { t } = useI18n();
const { currency, intlLocale } = useMoneyCurrency();
const {
  month,
  yearMonth,
  isLoading,
  error,
  fetchMonth,
  shiftMonth,
  copyFromPrevious,
} = useMoneyBudgets();
const { pushToast } = useToasts();
const { exportBudgetsCsv, exportBudgetsJson } = useMoneyExport();

const modalOpen = ref(false);
const editing = ref<MoneyBudget | null>(null);
const copying = ref(false);

await useAsyncData("money:budgets:initial", async () => {
  await fetchMonth();
  return { ok: true };
});

useSeoMeta({
  title: () => t("seo.moneyBudgets"),
  description: () => t("seo.moneyBudgetsDescription"),
  robots: "noindex, nofollow",
});

usePageShortcuts([{ key: "n", handler: () => openCreate() }]);

const moneyLocale = intlLocale;

function fmt(n: number) {
  return formatMoneyMinor(n, moneyLocale.value, currency.value);
}

function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y!, m! - 1, 1);
  try {
    return new Intl.DateTimeFormat(moneyLocale.value, {
      month: "long",
      year: "numeric",
    }).format(d);
  } catch {
    return ym;
  }
}

function pct(budget: MoneyBudget) {
  return Math.min(999, Math.round(budget.progress * 100));
}

function barClass(budget: MoneyBudget) {
  if (budget.progress >= 1) return "bg-rose-500";
  if (budget.progress >= 0.85) return "bg-amber-500";
  return "bg-brand-500";
}

function labelFor(budget: MoneyBudget) {
  if (budget.scope === MoneyBudgetScope.Overall) {
    return t("money.budgets.scope.overall");
  }
  if (budget.userCategory) {
    return `${budget.userCategory.emoji} ${budget.userCategory.name}`;
  }
  if (budget.category != null) {
    return `${MONEY_CATEGORY_EMOJI[budget.category]} ${t(MONEY_CATEGORY_I18N_KEYS[budget.category])}`;
  }
  return t("money.budgets.scope.category");
}

function colorFor(budget: MoneyBudget) {
  if (budget.userCategory) return budget.userCategory.color;
  if (budget.category != null) return MONEY_CATEGORY_COLORS[budget.category];
  return "#94a3b8";
}

async function goMonth(delta: number) {
  await fetchMonth(shiftMonth(delta));
}

async function goCurrentMonth() {
  await fetchMonth(toYearMonth(new Date()));
}

function openCreate() {
  editing.value = null;
  modalOpen.value = true;
}

function openEdit(budget: MoneyBudget) {
  editing.value = budget;
  modalOpen.value = true;
}

function onSaved() {
  modalOpen.value = false;
  pushToast(t("toasts.budgetSaved"), { tone: "success" });
}

async function onCopy() {
  copying.value = true;
  try {
    const n = await copyFromPrevious();
    pushToast(t("toasts.budgetsCopied", { count: n }), { tone: "success" });
  } catch (err: unknown) {
    pushToast(
      err instanceof Error ? err.message : t("toasts.failedToCopyBudgets"),
      { tone: "danger" },
    );
  } finally {
    copying.value = false;
  }
}

const remaining = computed(() => {
  const m = month.value;
  if (!m) return 0;
  return m.budgetMinor - m.spentMinor;
});

const remainingTone = computed(() => {
  if (remaining.value > 0) return "in" as const;
  if (remaining.value < 0) return "out" as const;
  return "neutral" as const;
});

function onExportCsv() {
  if (!month.value) return;
  exportBudgetsCsv(month.value);
  pushToast(t("toasts.moneyExported"), { tone: "success" });
}

function onExportJson() {
  if (!month.value) return;
  exportBudgetsJson(month.value);
  pushToast(t("toasts.moneyExported"), { tone: "success" });
}
</script>

<template>
  <div class="money-shell relative flex min-h-0 flex-1 flex-col">
    <header
      class="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-white/80 px-4 py-4 backdrop-blur-md md:px-6"
    >
      <div>
        <p
          class="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-600"
        >
          {{ $t("nav.sectionMoney") }}
        </p>
        <h1 class="mt-0.5 text-xl font-semibold tracking-tight text-slate-900">
          {{ $t("money.budgets.title") }}
        </h1>
        <p class="mt-0.5 text-xs text-slate-500">
          {{ $t("money.budgets.subtitle") }}
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <MoneyExportMenu
          :disabled="isLoading || !month || month.budgets.length === 0"
          @csv="onExportCsv"
          @json="onExportJson"
        />
        <button
          type="button"
          class="rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-white disabled:opacity-50"
          :disabled="copying"
          @click="onCopy"
        >
          {{ $t("money.budgets.copyPrevious") }}
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm shadow-brand-600/20 transition hover:bg-brand-700"
          @click="openCreate"
        >
          {{ $t("money.budgets.add") }}
        </button>
      </div>
    </header>

    <div class="relative z-0 flex-1 overflow-y-auto scrollbar-thin">
      <div class="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-6">
        <MoneyMonthNav
          :label="monthLabel(yearMonth)"
          :prev-label="$t('money.prevMonth')"
          :next-label="$t('money.nextMonth')"
          :current-label="
            $t('money.currentMonthNav', { month: monthLabel(yearMonth) })
          "
          @prev="goMonth(-1)"
          @next="goMonth(1)"
          @current="goCurrentMonth"
        />

        <section
          class="grid grid-cols-1 gap-3 sm:grid-cols-3"
          :aria-label="$t('money.budgets.totalsAria')"
        >
          <MoneyStatCard
            :label="$t('money.budgets.budgeted')"
            :value="fmt(month?.budgetMinor ?? 0)"
            tone="neutral"
          />
          <MoneyStatCard
            :label="$t('money.budgets.spent')"
            :value="fmt(month?.spentMinor ?? 0)"
            tone="out"
          />
          <MoneyStatCard
            :label="$t('money.budgets.remaining')"
            :value="fmt(remaining)"
            :tone="remainingTone"
          />
        </section>

        <p v-if="error" class="text-sm text-rose-600" role="alert">
          {{ error }}
        </p>
        <div
          v-else-if="isLoading && !month?.budgets.length"
          class="rounded-2xl bg-white/70 p-2 ring-1 ring-slate-200/80"
          :aria-busy="true"
          :aria-label="$t('money.budgets.loading')"
        >
          <SkeletonList :rows="3" variant="card" />
        </div>
        <EmptyState
          v-else-if="!month?.budgets.length"
          illustration="chart"
          :title="$t('money.budgets.empty')"
          :description="$t('money.budgets.emptyHint')"
          :primary-label="$t('money.budgets.add')"
          primary-shortcut="N"
          :secondary-label="$t('money.budgets.copyPrevious')"
          :secondary-loading="copying"
          @primary="openCreate"
          @secondary="onCopy"
        />

        <ul v-else class="space-y-3">
          <li v-for="budget in month?.budgets" :key="budget.id">
            <button
              type="button"
              class="w-full rounded-2xl bg-white/90 px-4 py-4 text-left shadow-sm ring-1 ring-slate-200/80 transition hover:bg-white hover:ring-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
              @click="openEdit(budget)"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="flex min-w-0 items-center gap-2.5">
                  <span
                    v-if="budget.scope === MoneyBudgetScope.Category"
                    class="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white"
                    :style="{ backgroundColor: colorFor(budget) }"
                    aria-hidden="true"
                  />
                  <div class="min-w-0">
                    <p class="truncate text-sm font-semibold text-slate-900">
                      {{ labelFor(budget) }}
                    </p>
                    <p class="mt-0.5 text-xs text-slate-500">
                      <span class="font-medium tabular-nums text-slate-700">{{
                        fmt(budget.spentMinor)
                      }}</span>
                      /
                      {{ fmt(budget.amountMinor) }}
                    </p>
                  </div>
                </div>
                <p
                  class="shrink-0 text-xs font-semibold tabular-nums"
                  :class="
                    budget.progress >= 1 ? 'text-rose-700' : 'text-slate-500'
                  "
                >
                  {{ pct(budget) }}%
                </p>
              </div>
              <div
                class="mt-3.5 h-2.5 overflow-hidden rounded-full bg-slate-100"
                role="progressbar"
                :aria-valuenow="pct(budget)"
                aria-valuemin="0"
                aria-valuemax="100"
                :aria-label="
                  $t('money.budgets.progressAria', {
                    label: labelFor(budget),
                    pct: pct(budget),
                  })
                "
              >
                <div
                  class="h-full rounded-full transition-all duration-500"
                  :class="barClass(budget)"
                  :style="{
                    width: `${Math.min(100, Math.round(budget.progress * 100))}%`,
                  }"
                />
              </div>
            </button>
          </li>
        </ul>
      </div>
    </div>

    <LazyMoneyBudgetModal
      :open="modalOpen"
      :budget="editing"
      :year-month="yearMonth"
      @close="modalOpen = false"
      @saved="onSaved"
      @deleted="modalOpen = false"
    />
  </div>
</template>
