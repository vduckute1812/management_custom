<script setup lang="ts">
import {
  MONEY_CATEGORY_COLORS,
  MONEY_CATEGORY_I18N_KEYS,
  MoneyBudgetScope,
  type MoneyBudget,
} from "~/types/money";
import { formatMoneyMinor, toYearMonth } from "~/utils/money";

const { t, locale } = useI18n();
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

function fmt(n: number) {
  return formatMoneyMinor(n, moneyLocale.value);
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
  if (budget.category != null) {
    return t(MONEY_CATEGORY_I18N_KEYS[budget.category]);
  }
  return t("money.budgets.scope.category");
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
</script>

<template>
  <div class="flex h-screen flex-col">
    <header
      class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-4 md:px-6"
    >
      <div>
        <h1 class="text-xl font-semibold text-slate-900">
          {{ $t("money.budgets.title") }}
        </h1>
        <p class="mt-0.5 text-xs text-slate-500">
          {{ $t("money.budgets.subtitle") }}
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50"
          :disabled="copying"
          @click="onCopy"
        >
          {{ $t("money.budgets.copyPrevious") }}
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-700"
          @click="openCreate"
        >
          {{ $t("money.budgets.add") }}
        </button>
      </div>
    </header>

    <div class="flex-1 overflow-y-auto scrollbar-thin">
      <div class="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-6">
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="rounded-lg px-2 py-1.5 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            :aria-label="$t('money.prevMonth')"
            @click="goMonth(-1)"
          >
            ←
          </button>
          <button
            type="button"
            class="min-w-[10rem] rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50"
            @click="goCurrentMonth"
          >
            {{ monthLabel(yearMonth) }}
          </button>
          <button
            type="button"
            class="rounded-lg px-2 py-1.5 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            :aria-label="$t('money.nextMonth')"
            @click="goMonth(1)"
          >
            →
          </button>
        </div>

        <section
          class="grid grid-cols-1 gap-3 sm:grid-cols-3"
          :aria-label="$t('money.budgets.totalsAria')"
        >
          <div class="rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
            <p
              class="text-[11px] font-semibold uppercase tracking-wider text-slate-500"
            >
              {{ $t("money.budgets.budgeted") }}
            </p>
            <p class="mt-1 text-lg font-semibold tabular-nums text-slate-900">
              {{ fmt(month?.budgetMinor ?? 0) }}
            </p>
          </div>
          <div class="rounded-xl bg-rose-50/80 px-4 py-3 ring-1 ring-rose-100">
            <p
              class="text-[11px] font-semibold uppercase tracking-wider text-rose-700/80"
            >
              {{ $t("money.budgets.spent") }}
            </p>
            <p class="mt-1 text-lg font-semibold tabular-nums text-rose-800">
              {{ fmt(month?.spentMinor ?? 0) }}
            </p>
          </div>
          <div
            class="rounded-xl bg-emerald-50/80 px-4 py-3 ring-1 ring-emerald-100"
          >
            <p
              class="text-[11px] font-semibold uppercase tracking-wider text-emerald-700/80"
            >
              {{ $t("money.budgets.remaining") }}
            </p>
            <p
              class="mt-1 text-lg font-semibold tabular-nums"
              :class="remaining >= 0 ? 'text-emerald-800' : 'text-rose-800'"
            >
              {{ fmt(remaining) }}
            </p>
          </div>
        </section>

        <p v-if="error" class="text-sm text-rose-600" role="alert">
          {{ error }}
        </p>
        <p
          v-else-if="isLoading && !month?.budgets.length"
          class="text-sm text-slate-500"
        >
          {{ $t("money.budgets.loading") }}
        </p>
        <p
          v-else-if="!month?.budgets.length"
          class="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 ring-1 ring-slate-200"
        >
          {{ $t("money.budgets.empty") }}
        </p>

        <ul v-else class="space-y-3">
          <li
            v-for="budget in month?.budgets"
            :key="budget.id"
            class="cursor-pointer rounded-xl bg-white px-4 py-4 ring-1 ring-slate-200 transition hover:bg-slate-50"
            @click="openEdit(budget)"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="flex min-w-0 items-center gap-2">
                <span
                  v-if="
                    budget.scope === MoneyBudgetScope.Category &&
                    budget.category != null
                  "
                  class="h-2.5 w-2.5 shrink-0 rounded-full"
                  :style="{
                    backgroundColor: MONEY_CATEGORY_COLORS[budget.category],
                  }"
                  aria-hidden="true"
                />
                <div class="min-w-0">
                  <p class="truncate text-sm font-semibold text-slate-900">
                    {{ labelFor(budget) }}
                  </p>
                  <p class="mt-0.5 text-xs text-slate-500">
                    {{ fmt(budget.spentMinor) }}
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
            <div class="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                class="h-full rounded-full transition-all"
                :class="barClass(budget)"
                :style="{
                  width: `${Math.min(100, Math.round(budget.progress * 100))}%`,
                }"
              />
            </div>
          </li>
        </ul>
      </div>
    </div>

    <MoneyBudgetModal
      :open="modalOpen"
      :budget="editing"
      :year-month="yearMonth"
      @close="modalOpen = false"
      @saved="onSaved"
      @deleted="modalOpen = false"
    />
  </div>
</template>
