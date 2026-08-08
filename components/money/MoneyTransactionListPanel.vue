<script setup lang="ts">
import { MoneyDirection, type MoneyTransaction } from "~/types/money";
import { resolveMoneyCategoryMeta } from "~/utils/money";

defineProps<{
  transactions: MoneyTransaction[];
  allTransactions: MoneyTransaction[];
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  nextCursor: string | null;
  formatAmount: (amount: number) => string;
  formatDate: (iso: string) => string;
}>();

const emit = defineEmits<{
  retry: [];
  create: [];
  clearFilters: [];
  edit: [tx: MoneyTransaction];
  loadMore: [];
}>();

const { t } = useI18n();

function txMeta(tx: MoneyTransaction) {
  return resolveMoneyCategoryMeta(tx, t);
}
</script>

<template>
  <InlineErrorAlert
    v-if="error"
    :message="error"
    :retry-label="$t('common.retry')"
    @retry="emit('retry')"
  />
  <div
    v-else-if="isLoading && !allTransactions.length"
    class="rounded-2xl bg-white/70 p-2 ring-1 ring-slate-200/80"
    :aria-busy="true"
    :aria-label="$t('money.loading')"
  >
    <SkeletonList :rows="4" />
  </div>
  <EmptyState
    v-else-if="!allTransactions.length"
    illustration="chart"
    :title="$t('money.empty')"
    :description="$t('money.emptyHint')"
    :primary-label="$t('money.addTransaction')"
    primary-shortcut="N"
    @primary="emit('create')"
  />
  <EmptyState
    v-else-if="!transactions.length"
    illustration="spark"
    :title="$t('money.filterEmpty')"
    :primary-label="$t('money.clearFilter')"
    @primary="emit('clearFilters')"
  />

  <ul
    v-else
    class="overflow-hidden rounded-2xl bg-white/90 shadow-sm ring-1 ring-slate-200/80"
  >
    <li
      v-for="(tx, idx) in transactions"
      :key="tx.id"
      :class="idx > 0 ? 'border-t border-slate-100' : ''"
    >
      <button
        type="button"
        class="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50/90 focus-visible:bg-brand-50/50 focus-visible:outline-none"
        @click="emit('edit', tx)"
      >
        <div class="flex min-w-0 items-start gap-3">
          <span class="mt-0.5 text-base leading-none" aria-hidden="true">{{
            txMeta(tx)?.emoji || "📦"
          }}</span>
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
              {{ formatDate(tx.occurredOn) }}
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
              ? `+${formatAmount(tx.amountMinor)}`
              : `−${formatAmount(tx.amountMinor)}`
          }}
        </p>
      </button>
    </li>
  </ul>
  <div v-if="nextCursor" class="flex justify-center">
    <button
      type="button"
      class="rounded-lg px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50"
      :disabled="isLoadingMore"
      :aria-busy="isLoadingMore"
      @click="emit('loadMore')"
    >
      {{ $t("common.loadMore") }}
    </button>
  </div>
</template>
