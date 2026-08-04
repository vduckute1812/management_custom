<script setup lang="ts">
import {
  MoneyDirection,
  moneyCategoryKey,
  moneyCategoryPickFromTx,
  type MoneyCategoryPick,
  type MoneyTransaction,
} from "~/types/money";
import {
  formatMoneyMinor,
  resolveMoneyCategoryMeta,
  toYearMonth,
} from "~/utils/money";

const { t } = useI18n();
const { currency, intlLocale } = useMoneyCurrency();
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
const { fetchCategories } = useMoneyCategories();

const modalOpen = ref(false);
const editing = ref<MoneyTransaction | null>(null);
const filterDirection = ref<"all" | MoneyDirection>("all");
const filterCategoryPick = ref<MoneyCategoryPick | null>(null);

await useAsyncData("money:initial", async () => {
  await Promise.all([fetchMonth(), fetchCategories()]);
  return { ok: true };
});

useSeoMeta({
  title: () => t("seo.money"),
  description: () => t("seo.moneyDescription"),
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

function txMeta(tx: MoneyTransaction) {
  return resolveMoneyCategoryMeta(tx, t);
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
  <div
    class="relative flex min-h-0 flex-1 flex-col bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-brand-50/70 via-slate-50 to-slate-100"
  >
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
          class="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm shadow-brand-600/20 transition hover:bg-brand-700"
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

    <div class="relative z-0 flex-1 overflow-y-auto scrollbar-thin">
      <div class="mx-auto max-w-4xl space-y-6 px-4 py-6 md:px-6">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <MoneyMonthNav
            :label="monthLabel(yearMonth)"
            :prev-label="$t('money.prevMonth')"
            :next-label="$t('money.nextMonth')"
            @prev="goMonth(-1)"
            @next="goMonth(1)"
            @current="goCurrentMonth"
          />
        </div>

        <section
          class="grid grid-cols-1 gap-3 sm:grid-cols-3"
          :aria-label="$t('money.totalsAria')"
        >
          <MoneyStatCard
            :label="$t('money.in')"
            :value="fmt(totals?.inMinor ?? 0)"
            tone="in"
          />
          <MoneyStatCard
            :label="$t('money.out')"
            :value="fmt(totals?.outMinor ?? 0)"
            tone="out"
          />
          <MoneyStatCard
            :label="$t('money.net')"
            :value="fmt(totals?.netMinor ?? 0)"
            :tone="netTone"
          />
        </section>

        <MoneyCharts
          :transactions="transactions"
          :year-month="yearMonth"
          :locale-tag="moneyLocale"
          :currency="currency"
          :active-pick="filterCategoryPick"
          @select-category="onSelectCategoryFromChart"
        />

        <div
          class="sticky top-0 z-[1] -mx-1 space-y-3 rounded-2xl bg-white/90 p-3 shadow-sm ring-1 ring-slate-200/80 backdrop-blur-md"
        >
          <div
            class="flex flex-wrap items-center gap-2"
            role="group"
            :aria-label="$t('money.filterDirectionAria')"
          >
            <button
              type="button"
              class="rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 transition"
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
              class="rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 transition"
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
              class="rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 transition"
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

          <div class="flex flex-wrap items-end gap-2">
            <div class="min-w-[12rem] flex-1">
              <label
                class="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500"
                for="money-filter-category"
              >
                {{ $t("money.modal.category") }}
              </label>
              <MoneyCategorySelect
                id="money-filter-category"
                v-model="filterCategoryPick"
                mode="all"
                allow-null
                :allow-create="false"
                size="sm"
                :aria-label="$t('money.filterCategoryAria')"
              />
            </div>
            <button
              v-if="hasFilters"
              type="button"
              class="mb-0.5 rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50"
              @click="clearFilters"
            >
              {{ $t("money.clearFilter") }}
            </button>
          </div>
        </div>

        <p v-if="error" class="text-sm text-rose-600" role="alert">
          {{ error }}
        </p>
        <div
          v-else-if="isLoading && !transactions.length"
          class="space-y-2 rounded-2xl bg-white/70 p-4 ring-1 ring-slate-200/80"
          :aria-busy="true"
          :aria-label="$t('money.loading')"
        >
          <div
            v-for="i in 4"
            :key="i"
            class="h-12 animate-pulse rounded-xl bg-slate-100"
          />
        </div>
        <EmptyState
          v-else-if="!transactions.length"
          illustration="chart"
          :title="$t('money.empty')"
          :description="$t('money.emptyHint')"
          :primary-label="$t('money.addTransaction')"
          primary-shortcut="N"
          @primary="openCreate"
        />
        <EmptyState
          v-else-if="!filtered.length"
          illustration="spark"
          :title="$t('money.filterEmpty')"
          :primary-label="$t('money.clearFilter')"
          @primary="clearFilters"
        />

        <ul
          v-else
          class="overflow-hidden rounded-2xl bg-white/90 shadow-sm ring-1 ring-slate-200/80"
        >
          <li
            v-for="(tx, idx) in filtered"
            :key="tx.id"
            :class="idx > 0 ? 'border-t border-slate-100' : ''"
          >
            <button
              type="button"
              class="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50/90 focus-visible:bg-brand-50/50 focus-visible:outline-none"
              @click="openEdit(tx)"
            >
              <div class="flex min-w-0 items-start gap-3">
                <span
                  class="mt-0.5 text-base leading-none"
                  aria-hidden="true"
                  >{{ txMeta(tx)?.emoji || "📦" }}</span
                >
                <span
                  class="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full shadow-sm ring-2 ring-white"
                  :style="{
                    backgroundColor: txMeta(tx)?.color || '#94a3b8',
                  }"
                  aria-hidden="true"
                />
                <div class="min-w-0">
                  <p class="truncate text-sm font-semibold text-slate-900">
                    {{ txMeta(tx)?.label }}
                    <span v-if="tx.note" class="font-normal text-slate-500">
                      · {{ tx.note }}
                    </span>
                  </p>
                  <p class="mt-0.5 text-xs text-slate-400">
                    {{ formatTxDate(tx.occurredOn) }}
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
            </button>
          </li>
        </ul>
      </div>
    </div>

    <MoneyTransactionModal
      :open="modalOpen"
      :transaction="editing"
      :default-category-pick="filterCategoryPick"
      @close="modalOpen = false"
      @saved="onSaved"
      @deleted="onDeleted"
    />
  </div>
</template>
