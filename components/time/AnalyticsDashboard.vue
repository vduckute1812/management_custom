<script setup lang="ts">
import type { Epic, Task } from "~/types/task";
import {
  useAnalyticsBuckets,
  useAnalyticsEpicBreakdown,
  useAnalyticsTotals,
} from "~/composables/time/useAnalyticsBuckets";

const props = defineProps<{
  tasks: Task[];
  epics?: Epic[];
  granularity?: "day" | "week" | "month";
}>();

const granularity = computed(() => props.granularity ?? "week");

const buckets = useAnalyticsBuckets(() => props.tasks, granularity);
const totals = useAnalyticsTotals(() => props.tasks);
const epicBreakdown = useAnalyticsEpicBreakdown(() => props.epics ?? []);
</script>

<template>
  <div class="space-y-5">
    <AnalyticsSummaryCards :totals="totals" />
    <AnalyticsChartPanel :buckets="buckets" :granularity="granularity" />
    <AnalyticsEpicBreakdown :rows="epicBreakdown" />
  </div>
</template>
