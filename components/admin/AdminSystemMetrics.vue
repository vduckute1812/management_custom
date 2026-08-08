<script setup lang="ts">
import type { SystemSnapshot } from "~/types/system";

interface HistoryPoint {
  at: number;
  cpu: number;
  mem: number;
  disk: number;
  dbMs: number;
  healthMs: number;
  redisMs: number | null;
}

defineProps<{
  snapshot: SystemSnapshot;
  history: HistoryPoint[];
}>();
</script>

<template>
  <AdminSystemMetricsGauges :snapshot="snapshot" />
  <AdminSystemMetricsTrend :history="history" />
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
    <AdminSystemMetricsLatency :snapshot="snapshot" />
    <AdminSystemMetricsServices :snapshot="snapshot" />
  </div>
</template>
