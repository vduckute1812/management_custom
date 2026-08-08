<script setup lang="ts">
import type { AnalyticsTotals } from "~/composables/time/useAnalyticsBuckets";

defineProps<{
  totals: AnalyticsTotals;
}>();
</script>

<template>
  <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
    <div class="bg-white ring-1 ring-slate-200 rounded-xl p-4 shadow-sm">
      <p class="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
        {{ $t("analytics.completionRate") }}
      </p>
      <p class="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">
        {{ totals.completionRate }}%
      </p>
      <p class="text-xs text-slate-500 mt-0.5">
        {{
          $t("analytics.doneOfTotal", {
            done: totals.completed,
            total: totals.completed + totals.inProgress + totals.todo,
          })
        }}
      </p>
    </div>

    <div class="bg-white ring-1 ring-slate-200 rounded-xl p-4 shadow-sm">
      <p class="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
        {{ $t("analytics.estimatedVsActual") }}
      </p>
      <p class="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">
        {{ totals.totalSpent }}h /
        <span class="text-slate-400">{{ totals.totalEstimated }}h</span>
      </p>
      <p
        class="text-xs mt-0.5 tabular-nums"
        :class="totals.avgVariance > 0 ? 'text-rose-600' : 'text-emerald-600'"
      >
        {{
          $t("analytics.avgVariance", {
            sign: totals.avgVariance > 0 ? "+" : "",
            hours: totals.avgVariance,
          })
        }}
      </p>
    </div>

    <div class="bg-white ring-1 ring-slate-200 rounded-xl p-4 shadow-sm">
      <p class="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
        {{ $t("analytics.inProgress") }}
      </p>
      <p class="mt-1 text-2xl font-semibold text-amber-600 tabular-nums">
        {{ totals.inProgress }}
      </p>
      <p class="text-xs text-slate-500 mt-0.5">
        {{ $t("analytics.stillInBacklog", { count: totals.todo }) }}
      </p>
    </div>

    <div class="bg-white ring-1 ring-slate-200 rounded-xl p-4 shadow-sm">
      <p class="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
        {{ $t("analytics.overdue") }}
      </p>
      <p
        class="mt-1 text-2xl font-semibold tabular-nums"
        :class="totals.overdue > 0 ? 'text-rose-600' : 'text-slate-900'"
      >
        {{ totals.overdue }}
      </p>
      <p class="text-xs text-slate-500 mt-0.5">
        {{ $t("analytics.pastDueNotDone") }}
      </p>
    </div>
  </div>
</template>
