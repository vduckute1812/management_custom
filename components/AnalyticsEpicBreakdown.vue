<script setup lang="ts">
import type { AnalyticsEpicRow } from "~/composables/useAnalyticsBuckets";

defineProps<{
  rows: AnalyticsEpicRow[];
}>();
</script>

<template>
  <div
    v-if="rows.length > 0"
    class="bg-white ring-1 ring-slate-200 rounded-xl shadow-sm"
  >
    <header class="px-4 py-3 border-b border-slate-100">
      <h3 class="text-sm font-semibold text-slate-800">
        {{ $t("analytics.epicVelocity") }}
      </h3>
      <p class="text-[11px] text-slate-500">
        {{ $t("analytics.epicVelocityHint") }}
      </p>
    </header>
    <ul class="divide-y divide-slate-100">
      <li v-for="row in rows" :key="row.epic.id">
        <NuxtLink
          :to="`/epics/${row.epic.id}`"
          class="px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-300"
        >
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-slate-800 truncate">
              {{ row.epic.title }}
            </p>
            <p class="text-[11px] text-slate-500 tabular-nums">
              {{
                $t("analytics.epicMeta", {
                  count: row.epic.taskCount,
                  progress: row.epic.progress,
                })
              }}
            </p>
            <div class="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div
                class="h-full bg-brand-500"
                :style="{ width: (row.epic.progress ?? 0) + '%' }"
              />
            </div>
          </div>
          <div class="text-right tabular-nums">
            <p class="text-sm font-semibold text-slate-900">
              {{ row.epic.spentHours }}h /
              <span class="text-slate-400">{{ row.epic.estimatedHours }}h</span>
            </p>
            <p
              class="text-[11px] font-medium"
              :class="row.variance > 0 ? 'text-rose-600' : 'text-emerald-600'"
            >
              {{ row.variance > 0 ? "+" : "" }}{{ row.variance }}h
            </p>
          </div>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>
