<script setup lang="ts">
import {
  MoneyDirection,
  moneyCategoryKey,
  moneyCategoryPickFromTx,
  type MoneyCategoryPick,
  type MoneyTransaction,
} from "~/types/money";
import { formatMoneyMinor, toYearMonth } from "~/utils/money";

const { t } = useI18n();
const { currency, intlLocale } = useMoneyCurrency();
const {
  transactions,
  totals,
  yearMonth,
  nextCursor,
  isLoading,
  isLoadingMore,
  error,
  fetchMonth,
  loadMore,
  shiftMonth,
} = useMoney();
const { pushToast } = useToasts();
const { exportTransactionsCsv, exportTransactionsJson } = useMoneyExport();
const { fetchCategories } = useMoneyCategories();

const modalOpen = ref(false);
const editing = ref<MoneyTransaction | null>(null);
const filterDirection = ref<"all" | MoneyDirection>("all");
const filterCategoryPick = ref<MoneyCategoryPick | null>(null);
const chartsExpanded = ref(false);

await useAsyncData("money:initial", async () => {
  await Promise.all([fetchMonth(), fetchCategories()]);
  return { ok: true };
});

useSeoMeta({
  title: () => t("seo.money"),
  description: () => t("seo.moneyDescription"),
  robots: "noindex, nofollow",
});

usePageShortcuts([{ key: "n", handler: () => openCreate() }]);

const moneyLocale = intlLocale;

function fmt(amount: number) {
  return formatMoneyMinor(amount, moneyLocale.value, currency.value);
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

function formatTxDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  try {
    return new Intl.DateTimeFormat(moneyLocale.value, {
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(new Date(y, m - 1, d));
  } catch {
    return iso;
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
    if (filterCategoryPick.value != null) {
      const pick = moneyCategoryPickFromTx(tx);
      if (!pick) return false;
      if (
        moneyCategoryKey(pick) !== moneyCategoryKey(filterCategoryPick.value)
      ) {
        return false;
      }
    }
    return true;
  });
});

const hasFilters = computed(
  () => filterDirection.value !== "all" || filterCategoryPick.value != null,
);

async function goMonth(delta: number) {
  filterCategoryPick.value = null;
  const next = shiftMonth(delta);
  await fetchMonth(next);
}

async function goCurrentMonth() {
  filterCategoryPick.value = null;
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

function clearFilters() {
  filterDirection.value = "all";
  filterCategoryPick.value = null;
}

function onSelectCategoryFromChart(pick: MoneyCategoryPick) {
  filterDirection.value = MoneyDirection.Out;
  filterCategoryPick.value = pick;
}

function onExportCsv() {
  exportTransactionsCsv(yearMonth.value, transactions.value);
  pushToast(t("toasts.moneyExported"), { tone: "success" });
}

function onExportJson() {
  exportTransactionsJson(yearMonth.value, transactions.value, totals.value);
  pushToast(t("toasts.moneyExported"), { tone: "success" });
}

const netTone = computed(() => {
  const n = totals.value?.netMinor ?? 0;
  if (n > 0) return "in" as const;
  if (n < 0) return "out" as const;
  return "neutral" as const;
});
</script>

<template>
  <div class="money-shell relative flex min-h-0 flex-1 flex-col">
    <MoneyPageHeader
      :export-disabled="isLoading || transactions.length === 0"
      @create="openCreate"
      @export-csv="onExportCsv"
      @export-json="onExportJson"
    />

    <div class="relative z-0 flex-1 overflow-y-auto scrollbar-thin">
      <div class="mx-auto max-w-4xl space-y-6 px-4 py-6 md:px-6">
        <div class="flex flex-wrap items-center justify-between gap-3">
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
        </div>

        <MoneyTotalsPanel
          :in-label="$t('money.in')"
          :out-label="$t('money.out')"
          :net-label="$t('money.net')"
          :in-value="fmt(totals?.inMinor ?? 0)"
          :out-value="fmt(totals?.outMinor ?? 0)"
          :net-value="fmt(totals?.netMinor ?? 0)"
          :net-tone="netTone"
          :totals-aria="$t('money.totalsAria')"
        />

        <MoneyChartsPanel
          :transactions="transactions"
          :year-month="yearMonth"
          :locale-tag="moneyLocale"
          :currency="currency"
          :active-pick="filterCategoryPick"
          :expanded="chartsExpanded"
          @update:expanded="chartsExpanded = $event"
          @select-category="onSelectCategoryFromChart"
        />

        <MoneyFiltersPanel
          :filter-direction="filterDirection"
          :filter-category-pick="filterCategoryPick"
          :has-filters="hasFilters"
          @update:filter-direction="filterDirection = $event"
          @update:filter-category-pick="filterCategoryPick = $event"
          @clear-filters="clearFilters"
        />

        <MoneyTransactionListPanel
          :transactions="filtered"
          :all-transactions="transactions"
          :is-loading="isLoading"
          :is-loading-more="isLoadingMore"
          :error="error"
          :next-cursor="nextCursor"
          :format-amount="fmt"
          :format-date="formatTxDate"
          @retry="fetchMonth()"
          @create="openCreate"
          @clear-filters="clearFilters"
          @edit="openEdit"
          @load-more="loadMore"
        />
      </div>
    </div>

    <LazyMoneyTransactionModal
      :open="modalOpen"
      :transaction="editing"
      :default-category-pick="filterCategoryPick"
      @close="modalOpen = false"
      @saved="onSaved"
      @deleted="onDeleted"
    />
  </div>
</template>
