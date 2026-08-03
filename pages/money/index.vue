<script setup lang="ts">
import {
  MONEY_CATEGORIES,
  MONEY_CATEGORY_COLORS,
  MONEY_CATEGORY_I18N_KEYS,
  MoneyDirection,
  type MoneyCategory,
  type MoneyTransaction,
} from "~/types/money";
import { formatMoneyMinor, toYearMonth } from "~/utils/money";

const { t, locale } = useI18n();
const {
  transactions,
  totals,
  yearMonth,
  isLoading,
  error,
  fetchMonth,
  shiftMonth,
} = useMoney();
const { pushToast } = useToasts();
const { exportTransactionsCsv, exportTransactionsJson } = useMoneyExport();

const modalOpen = ref(false);
const editing = ref<MoneyTransaction | null>(null);
const filterDirection = ref<"all" | MoneyDirection>("all");
const filterCategory = ref<MoneyCategory | null>(null);

await useAsyncData("money:initial", async () => {
  await fetchMonth();
  return { ok: true };
});

useSeoMeta({
  title: () => t("seo.money"),
  description: () => t("seo.moneyDescription"),
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

const filtered = computed(() => {
  return transactions.value.filter((tx) => {
    if (
      filterDirection.value !== "all" &&
      tx.direction !== filterDirection.value
    ) {
      return false;
    }
    if (filterCategory.value != null && tx.category !== filterCategory.value) {
      return false;
    }
    return true;
  });
});

const activeFilterCategories = computed(() => {
  const seen = new Set<MoneyCategory>();
  for (const tx of transactions.value) {
    if (
      filterDirection.value !== "all" &&
      tx.direction !== filterDirection.value
    ) {
      continue;
    }
    seen.add(tx.category);
  }
  return MONEY_CATEGORIES.filter((c) => seen.has(c));
});

async function goMonth(delta: number) {
  filterCategory.value = null;
  const next = shiftMonth(delta);
  await fetchMonth(next);
}

async function goCurrentMonth() {
  filterCategory.value = null;
  await fetchMonth(toYearMonth(new Date()));
}

function openCreate() {
  editing.value = null;
  modalOpen.value = true;
}

function openEdit(tx: MoneyTransaction) {
  editing.value = tx;
  modalOpen.value = true;
}

function onSaved() {
  modalOpen.value = false;
  pushToast(t("toasts.moneyTransactionSaved"), { tone: "success" });
}

function onDeleted() {
  modalOpen.value = false;
}

function toggleCategoryFilter(cat: MoneyCategory) {
  filterCategory.value = filterCategory.value === cat ? null : cat;
}

function onSelectCategoryFromChart(cat: MoneyCategory) {
  filterDirection.value = MoneyDirection.Out;
  filterCategory.value = cat;
}

function onExportCsv() {
  exportTransactionsCsv(yearMonth.value, transactions.value);
  pushToast(t("toasts.moneyExported"), { tone: "success" });
}

function onExportJson() {
  exportTransactionsJson(yearMonth.value, transactions.value, totals.value);
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
          {{ $t("money.title") }}
        </h1>
        <p class="mt-0.5 text-xs text-slate-500">
          {{ $t("money.subtitle") }}
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <MoneyExportMenu
          :disabled="isLoading || transactions.length === 0"
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
          {{ $t("money.addTransaction") }}
        </button>
      </div>
    </header>

    <div class="flex-1 overflow-y-auto scrollbar-thin">
      <div class="mx-auto max-w-4xl space-y-6 px-4 py-6 md:px-6">
        <div class="flex flex-wrap items-center justify-between gap-3">
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
        </div>

        <section
          class="grid grid-cols-1 gap-3 sm:grid-cols-3"
          :aria-label="$t('money.totalsAria')"
        >
          <div
            class="rounded-xl bg-emerald-50/80 px-4 py-3 ring-1 ring-emerald-100"
          >
            <p
              class="text-[11px] font-semibold uppercase tracking-wider text-emerald-700/80"
            >
              {{ $t("money.in") }}
            </p>
            <p class="mt-1 text-lg font-semibold tabular-nums text-emerald-800">
              {{ fmt(totals?.inMinor ?? 0) }}
            </p>
          </div>
          <div class="rounded-xl bg-rose-50/80 px-4 py-3 ring-1 ring-rose-100">
            <p
              class="text-[11px] font-semibold uppercase tracking-wider text-rose-700/80"
            >
              {{ $t("money.out") }}
            </p>
            <p class="mt-1 text-lg font-semibold tabular-nums text-rose-800">
              {{ fmt(totals?.outMinor ?? 0) }}
            </p>
          </div>
          <div class="rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
            <p
              class="text-[11px] font-semibold uppercase tracking-wider text-slate-500"
            >
              {{ $t("money.net") }}
            </p>
            <p
              class="mt-1 text-lg font-semibold tabular-nums"
              :class="
                (totals?.netMinor ?? 0) >= 0
                  ? 'text-emerald-800'
                  : 'text-rose-800'
              "
            >
              {{ fmt(totals?.netMinor ?? 0) }}
            </p>
          </div>
        </section>

        <MoneyCharts
          :transactions="transactions"
          :year-month="yearMonth"
          :locale-tag="moneyLocale"
          @select-category="onSelectCategoryFromChart"
        />

        <div class="space-y-3">
          <div
            class="flex flex-wrap gap-1.5"
            role="group"
            :aria-label="$t('money.filterDirectionAria')"
          >
            <button
              type="button"
              class="rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 transition"
              :class="
                filterDirection === 'all'
                  ? 'bg-slate-900 text-white ring-slate-900'
                  : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
              "
              :aria-pressed="filterDirection === 'all'"
              @click="filterDirection = 'all'"
            >
              {{ $t("money.filterAll") }}
            </button>
            <button
              type="button"
              class="rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 transition"
              :class="
                filterDirection === MoneyDirection.Out
                  ? 'bg-rose-600 text-white ring-rose-600'
                  : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
              "
              :aria-pressed="filterDirection === MoneyDirection.Out"
              @click="filterDirection = MoneyDirection.Out"
            >
              {{ $t("money.direction.out") }}
            </button>
            <button
              type="button"
              class="rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 transition"
              :class="
                filterDirection === MoneyDirection.In
                  ? 'bg-emerald-600 text-white ring-emerald-600'
                  : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
              "
              :aria-pressed="filterDirection === MoneyDirection.In"
              @click="filterDirection = MoneyDirection.In"
            >
              {{ $t("money.direction.in") }}
            </button>
          </div>

          <div
            v-if="activeFilterCategories.length"
            class="flex flex-wrap gap-1.5"
            role="group"
            :aria-label="$t('money.filterCategoryAria')"
          >
            <button
              v-for="cat in activeFilterCategories"
              :key="cat"
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium ring-1 transition"
              :class="
                filterCategory === cat
                  ? 'bg-slate-900 text-white ring-slate-900'
                  : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50'
              "
              :aria-pressed="filterCategory === cat"
              @click="toggleCategoryFilter(cat)"
            >
              <span
                class="h-2 w-2 rounded-full"
                :style="{ backgroundColor: MONEY_CATEGORY_COLORS[cat] }"
                aria-hidden="true"
              />
              {{ $t(MONEY_CATEGORY_I18N_KEYS[cat]) }}
            </button>
            <button
              v-if="filterCategory != null"
              type="button"
              class="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50"
              @click="filterCategory = null"
            >
              {{ $t("money.clearFilter") }}
            </button>
          </div>
        </div>

        <p v-if="error" class="text-sm text-rose-600" role="alert">
          {{ error }}
        </p>
        <p
          v-else-if="isLoading && !transactions.length"
          class="text-sm text-slate-500"
        >
          {{ $t("money.loading") }}
        </p>
        <p
          v-else-if="!transactions.length"
          class="rounded-xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500 ring-1 ring-slate-200"
        >
          {{ $t("money.empty") }}
        </p>
        <p
          v-else-if="!filtered.length"
          class="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500 ring-1 ring-slate-200"
        >
          {{ $t("money.filterEmpty") }}
        </p>

        <ul
          v-else
          class="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200"
        >
          <li
            v-for="tx in filtered"
            :key="tx.id"
            class="flex cursor-pointer items-center justify-between gap-3 bg-white px-4 py-3 transition hover:bg-slate-50 first:rounded-t-xl last:rounded-b-xl"
            @click="openEdit(tx)"
          >
            <div class="flex min-w-0 items-start gap-3">
              <span
                class="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                :style="{
                  backgroundColor: MONEY_CATEGORY_COLORS[tx.category],
                }"
                aria-hidden="true"
              />
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-slate-900">
                  {{ $t(MONEY_CATEGORY_I18N_KEYS[tx.category]) }}
                  <span v-if="tx.note" class="font-normal text-slate-500">
                    · {{ tx.note }}
                  </span>
                </p>
                <p class="mt-0.5 text-xs text-slate-400">
                  {{ tx.occurredOn }}
                </p>
              </div>
            </div>
            <p
              class="shrink-0 text-sm font-semibold tabular-nums"
              :class="
                tx.direction === MoneyDirection.In
                  ? 'text-emerald-700'
                  : 'text-rose-700'
              "
            >
              {{
                tx.direction === MoneyDirection.In
                  ? `+${fmt(tx.amountMinor)}`
                  : `−${fmt(tx.amountMinor)}`
              }}
            </p>
          </li>
        </ul>
      </div>
    </div>

    <MoneyTransactionModal
      :open="modalOpen"
      :transaction="editing"
      :default-category="filterCategory"
      @close="modalOpen = false"
      @saved="onSaved"
      @deleted="onDeleted"
    />
  </div>
</template>
