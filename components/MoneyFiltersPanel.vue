<script setup lang="ts">
import { MoneyDirection, type MoneyCategoryPick } from "~/types/money";

const props = defineProps<{
  filterDirection: "all" | MoneyDirection;
  filterCategoryPick: MoneyCategoryPick | null;
  hasFilters: boolean;
}>();

const emit = defineEmits<{
  "update:filterDirection": [value: "all" | MoneyDirection];
  "update:filterCategoryPick": [value: MoneyCategoryPick | null];
  clearFilters: [];
}>();

const categoryPick = computed({
  get: () => props.filterCategoryPick,
  set: (v) => emit("update:filterCategoryPick", v),
});
</script>

<template>
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
            ? 'money-chip--active ring-1'
            : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
        "
        :aria-pressed="filterDirection === 'all'"
        @click="emit('update:filterDirection', 'all')"
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
        @click="emit('update:filterDirection', MoneyDirection.Out)"
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
        @click="emit('update:filterDirection', MoneyDirection.In)"
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
          v-model="categoryPick"
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
        @click="emit('clearFilters')"
      >
        {{ $t("money.clearFilter") }}
      </button>
    </div>
  </div>
</template>
