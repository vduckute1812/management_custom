<script setup lang="ts">
import type { MoneyCategoryPick, MoneyTransaction } from "~/types/money";
import type { MoneyCurrency } from "~/types/money";

const props = defineProps<{
  transactions: MoneyTransaction[];
  yearMonth: string;
  localeTag: string;
  currency: MoneyCurrency;
  activePick: MoneyCategoryPick | null;
  expanded: boolean;
}>();

const emit = defineEmits<{
  "update:expanded": [value: boolean];
  selectCategory: [pick: MoneyCategoryPick];
}>();

function toggleExpanded() {
  emit("update:expanded", !props.expanded);
}
</script>

<template>
  <div class="space-y-3">
    <button
      type="button"
      class="flex w-full items-center justify-between rounded-xl bg-white/90 px-3 py-2 text-left text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200/80 xl:hidden"
      :aria-expanded="expanded"
      aria-controls="money-charts-panel"
      @click="toggleExpanded"
    >
      <span>{{ $t("money.chartsToggle") }}</span>
      <span class="text-xs font-medium text-slate-500" aria-hidden="true">
        {{ expanded ? "▴" : "▾" }}
      </span>
    </button>
    <div
      id="money-charts-panel"
      class="xl:block"
      :class="expanded ? 'block' : 'hidden'"
    >
      <LazyMoneyCharts
        :transactions="transactions"
        :year-month="yearMonth"
        :locale-tag="localeTag"
        :currency="currency"
        :active-pick="activePick"
        @select-category="emit('selectCategory', $event)"
      />
    </div>
  </div>
</template>
