<script setup lang="ts">
import type { SystemSnapshot } from "~/types/system";

const props = defineProps<{
  snapshot: SystemSnapshot;
}>();

const { t } = useI18n();

function formatBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return t("common.emDash");
  const abs = Math.abs(n);
  if (abs < 1024) return `${Math.round(n)} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let v = n / 1024;
  let i = 0;
  while (Math.abs(v) >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

function formatMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return t("common.emDash");
  return `${Math.round(ms)} ms`;
}

function latencyTone(ms: number | null | undefined, ok: boolean): string {
  if (!ok) return "text-rose-600";
  if (ms == null) return "text-slate-500";
  if (ms >= 200) return "text-amber-600";
  if (ms >= 80) return "text-slate-800";
  return "text-emerald-700";
}

const latencyRows = computed(() =>
  [
    {
      label: t("admin.systemLatencyDb"),
      ms: props.snapshot.latency.db.ms,
      ok: props.snapshot.latency.db.ok,
    },
    {
      label: t("admin.systemLatencyHealth"),
      ms: props.snapshot.latency.http.ms,
      ok: props.snapshot.latency.http.ok,
    },
    {
      label: t("admin.systemLatencyRedis"),
      ms: props.snapshot.latency.redis?.ms ?? null,
      ok: props.snapshot.latency.redis?.ok ?? false,
      skip: props.snapshot.latency.redis == null,
    },
  ].filter((r) => !("skip" in r && r.skip)),
);
</script>

<template>
  <div class="rounded-xl border border-slate-200 bg-white px-3 py-3 space-y-3">
    <h3 class="text-xs font-semibold text-slate-700">
      {{ $t("admin.systemLatency") }}
    </h3>
    <div v-for="row in latencyRows" :key="row.label" class="space-y-1">
      <div class="flex items-center justify-between text-sm">
        <span class="text-slate-600">{{ row.label }}</span>
        <span
          class="font-semibold tabular-nums"
          :class="latencyTone(row.ms, row.ok)"
        >
          {{ formatMs(row.ms) }}
          ·
          {{ row.ok ? $t("admin.systemOk") : $t("admin.systemFail") }}
        </span>
      </div>
      <div class="h-1.5 rounded-full bg-slate-200 overflow-hidden">
        <div
          class="h-full rounded-full transition-all"
          :class="
            !row.ok
              ? 'bg-rose-500'
              : (row.ms ?? 0) >= 200
                ? 'bg-amber-500'
                : 'bg-emerald-500'
          "
          :style="{
            width: `${Math.min(100, ((row.ms ?? 0) / 250) * 100)}%`,
          }"
        />
      </div>
    </div>
    <p class="text-[11px] text-slate-500">
      {{ $t("admin.systemLoadAvg") }}:
      {{ snapshot.host.loadAverage.join(" · ") }}
    </p>
    <p class="text-[11px] text-slate-500 tabular-nums">
      {{ $t("admin.systemRamProcess") }}:
      {{ formatBytes(snapshot.process.memory.rssBytes) }}
      ({{ $t("admin.systemHeap") }}
      {{ formatBytes(snapshot.process.memory.heapUsedBytes) }})
    </p>
  </div>
</template>
