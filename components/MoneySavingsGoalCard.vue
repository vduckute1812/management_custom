<script setup lang="ts">
import {
  MONEY_SAVINGS_GOAL_STATUS_I18N_KEYS,
  MoneySavingsGoalStatus,
  type MoneySavingsContribution,
  type MoneySavingsGoal,
} from "~/types/money";

const props = defineProps<{
  goal: MoneySavingsGoal;
  expanded: boolean;
  contributions: MoneySavingsContribution[];
  contribLoading: boolean;
  contribNextCursor: string | null;
  contribLoadingMore: boolean;
  fmt: (amount: number) => string;
}>();

const emit = defineEmits<{
  contribute: [];
  edit: [];
  toggleExpand: [];
  deleteContribution: [id: string];
  loadMoreContributions: [];
}>();

const pct = computed(() =>
  Math.min(100, Math.round(props.goal.progress * 100)),
);

const statusTone: Record<MoneySavingsGoalStatus, string> = {
  [MoneySavingsGoalStatus.Active]: "bg-sky-50 text-sky-700 ring-sky-100",
  [MoneySavingsGoalStatus.Completed]:
    "bg-emerald-50 text-emerald-700 ring-emerald-100",
  [MoneySavingsGoalStatus.Archived]:
    "bg-slate-100 text-slate-600 ring-slate-200",
};
</script>

<template>
  <article
    class="overflow-hidden rounded-2xl bg-white/90 shadow-sm ring-1 ring-slate-200/80 transition hover:ring-slate-300"
  >
    <div class="px-4 py-4 sm:px-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="text-base font-semibold tracking-tight text-slate-900">
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
            <span class="font-semibold tabular-nums text-slate-700">{{
              fmt(goal.savedMinor)
            }}</span>
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
            class="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700"
            @click="emit('contribute')"
          >
            {{ $t("money.savings.contributeAction") }}
          </button>
          <button
            type="button"
            class="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50"
            @click="emit('edit')"
          >
            {{ $t("money.savings.edit") }}
          </button>
          <button
            type="button"
            class="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50"
            @click="emit('toggleExpand')"
          >
            {{
              expanded
                ? $t("money.savings.hideContributions")
                : $t("money.savings.showContributions")
            }}
          </button>
        </div>
      </div>

      <div class="mt-4">
        <div
          class="h-2.5 overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          :aria-valuenow="pct"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-label="$t('money.savings.progressAria', { pct })"
        >
          <div
            class="h-full rounded-full transition-all duration-500"
            :class="
              goal.status === MoneySavingsGoalStatus.Completed
                ? 'bg-emerald-500'
                : 'bg-brand-500'
            "
            :style="{ width: `${pct}%` }"
          />
        </div>
        <p
          class="mt-1.5 text-right text-[11px] font-medium tabular-nums text-slate-500"
        >
          {{ pct }}%
        </p>
      </div>
      <p v-if="goal.note" class="mt-2 text-xs text-slate-500">
        {{ goal.note }}
      </p>
    </div>

    <div
      v-if="expanded"
      class="border-t border-slate-100 bg-slate-50/70 px-4 py-3 sm:px-5"
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
          class="flex items-center justify-between gap-3 py-2.5 text-sm"
        >
          <div class="min-w-0">
            <p class="tabular-nums font-semibold text-emerald-700">
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
            @click="emit('deleteContribution', c.id)"
          >
            {{ $t("money.savings.deleteContribution") }}
          </button>
        </li>
      </ul>
      <div v-if="contribNextCursor" class="pt-2">
        <button
          type="button"
          class="w-full rounded-lg px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50"
          :disabled="contribLoadingMore"
          :aria-busy="contribLoadingMore"
          @click="emit('loadMoreContributions')"
        >
          {{ $t("common.loadMore") }}
        </button>
      </div>
    </div>
  </article>
</template>
