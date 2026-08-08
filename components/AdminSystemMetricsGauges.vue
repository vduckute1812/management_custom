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

function barClass(percent: number): string {
  if (percent >= 90) return "bg-rose-500";
  if (percent >= 75) return "bg-amber-500";
  return "bg-emerald-500";
}

const gauges = computed(() => [
  {
    key: "cpu",
    label: t("admin.systemCpu"),
    pct: props.snapshot.process.cpu.percent,
    detail: t("admin.systemCpuDetail", {
      cores: props.snapshot.process.cpu.cores,
      ms: props.snapshot.process.cpu.sampleMs,
    }),
  },
  {
    key: "mem",
    label: t("admin.systemRamHost"),
    pct: props.snapshot.host.memory.usedPercent,
    detail: `${formatBytes(props.snapshot.host.memory.usedBytes)} / ${formatBytes(props.snapshot.host.memory.totalBytes)}`,
  },
  {
    key: "disk",
    label: t("admin.systemDisk"),
    pct: props.snapshot.host.disk?.usedPercent ?? 0,
    detail: props.snapshot.host.disk
      ? `${formatBytes(props.snapshot.host.disk.usedBytes)} / ${formatBytes(props.snapshot.host.disk.totalBytes)}`
      : t("admin.systemDiskUnavailable"),
  },
]);
</script>

<template>
  <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
    <div
      v-for="gauge in gauges"
      :key="gauge.key"
      class="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
    >
      <div class="flex items-baseline justify-between gap-2">
        <p class="text-[11px] uppercase tracking-wider text-slate-500">
          {{ gauge.label }}
        </p>
        <p class="text-2xl font-semibold tabular-nums text-slate-900">
          {{ Number(gauge.pct).toFixed(1) }}%
        </p>
      </div>
      <div class="mt-2 h-2.5 rounded-full bg-slate-200 overflow-hidden">
        <div
          class="h-full rounded-full transition-all duration-500"
          :class="barClass(Number(gauge.pct))"
          :style="{ width: `${Math.min(100, Number(gauge.pct))}%` }"
        />
      </div>
      <p class="mt-1.5 text-[11px] text-slate-500 tabular-nums">
        {{ gauge.detail }}
      </p>
    </div>
  </div>
</template>
