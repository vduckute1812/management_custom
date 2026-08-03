<script setup lang="ts">
import {
  MONEY_CATEGORY_I18N_KEYS,
  MoneyDirection,
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

const modalOpen = ref(false);
const editing = ref<MoneyTransaction | null>(null);

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

async function goMonth(delta: number) {
  const next = shiftMonth(delta);
  await fetchMonth(next);
}

async function goCurrentMonth() {
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
    </header>

    <div class="flex-1 overflow-y-auto scrollbar-thin">
      <div class="mx-auto max-w-3xl space-y-6 px-4 py-6 md:px-6">
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

        <ul
          v-else
          class="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-200"
        >
          <li
            v-for="tx in transactions"
            :key="tx.id"
            class="flex cursor-pointer items-center justify-between gap-3 bg-white px-4 py-3 transition hover:bg-slate-50 first:rounded-t-xl last:rounded-b-xl"
            @click="openEdit(tx)"
          >
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
      @close="modalOpen = false"
      @saved="onSaved"
      @deleted="onDeleted"
    />
  </div>
</template>
