<script setup lang="ts">
import type { Chart as ChartType } from "chart.js";
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

const props = defineProps<{
  snapshot: SystemSnapshot;
  history: HistoryPoint[];
}>();

const { t } = useI18n();
const trendChart = ref<HTMLCanvasElement | null>(null);
let trendInst: ChartType | null = null;
let ChartCtor: typeof ChartType | null = null;

async function ensureChartLib() {
  if (ChartCtor) return ChartCtor;
  const mod = await import("chart.js");
  mod.Chart.register(
    mod.LineController,
    mod.LineElement,
    mod.PointElement,
    mod.LinearScale,
    mod.CategoryScale,
    mod.Filler,
    mod.Legend,
    mod.Tooltip,
  );
  ChartCtor = mod.Chart;
  return ChartCtor;
}

function chartInkColors() {
  const styles = getComputedStyle(document.documentElement);
  const ink = styles.getPropertyValue("--ink").trim() || "#0f172a";
  const muted = styles.getPropertyValue("--ink-muted").trim() || "#64748b";
  const border = styles.getPropertyValue("--border").trim() || "#e2e8f0";
  return { ink, muted, border };
}

async function renderTrend() {
  if (!trendChart.value || props.history.length < 2) return;
  const Chart = await ensureChartLib();
  const { muted, border } = chartInkColors();
  const labels = props.history.map((h) =>
    new Date(h.at).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  );
  const cfg = {
    type: "line" as const,
    data: {
      labels,
      datasets: [
        {
          label: t("admin.systemCpu"),
          data: props.history.map((h) => h.cpu),
          borderColor: "rgb(14, 165, 233)",
          backgroundColor: "rgba(14, 165, 233, 0.12)",
          fill: true,
          tension: 0.35,
          pointRadius: 0,
          borderWidth: 2,
          yAxisID: "y",
        },
        {
          label: t("admin.systemRamHost"),
          data: props.history.map((h) => h.mem),
          borderColor: "rgb(99, 102, 241)",
          backgroundColor: "rgba(99, 102, 241, 0.08)",
          fill: true,
          tension: 0.35,
          pointRadius: 0,
          borderWidth: 2,
          yAxisID: "y",
        },
        {
          label: t("admin.systemLatencyDb"),
          data: props.history.map((h) => h.dbMs),
          borderColor: "rgb(245, 158, 11)",
          tension: 0.35,
          pointRadius: 0,
          borderWidth: 2,
          yAxisID: "y1",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index" as const, intersect: false },
      plugins: {
        legend: {
          position: "bottom" as const,
          labels: { boxWidth: 10, font: { size: 11 }, color: muted },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { maxTicksLimit: 6, font: { size: 10 }, color: muted },
        },
        y: {
          min: 0,
          max: 100,
          title: {
            display: true,
            text: "%",
            font: { size: 10 },
            color: muted,
          },
          ticks: { font: { size: 10 }, color: muted },
          grid: { color: border },
        },
        y1: {
          position: "right" as const,
          min: 0,
          grid: { drawOnChartArea: false },
          title: {
            display: true,
            text: "ms",
            font: { size: 10 },
            color: muted,
          },
          ticks: { font: { size: 10 }, color: muted },
        },
      },
    },
  };

  if (trendInst) {
    trendInst.data = cfg.data;
    trendInst.options = cfg.options;
    trendInst.update("none");
    return;
  }
  trendInst = new Chart(trendChart.value, cfg);
}

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

function barClass(percent: number): string {
  if (percent >= 90) return "bg-rose-500";
  if (percent >= 75) return "bg-amber-500";
  return "bg-emerald-500";
}

function latencyTone(ms: number | null | undefined, ok: boolean): string {
  if (!ok) return "text-rose-600";
  if (ms == null) return "text-slate-500";
  if (ms >= 200) return "text-amber-600";
  if (ms >= 80) return "text-slate-800";
  return "text-emerald-700";
}

watch(
  () => props.history,
  async () => {
    await nextTick();
    await renderTrend();
  },
  { deep: true, flush: "post" },
);

onMounted(() => {
  void renderTrend();
});

onBeforeUnmount(() => {
  trendInst?.destroy();
  trendInst = null;
});
</script>

<template>
  <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
    <div
      v-for="gauge in [
        {
          key: 'cpu',
          label: $t('admin.systemCpu'),
          pct: snapshot.process.cpu.percent,
          detail: $t('admin.systemCpuDetail', {
            cores: snapshot.process.cpu.cores,
            ms: snapshot.process.cpu.sampleMs,
          }),
        },
        {
          key: 'mem',
          label: $t('admin.systemRamHost'),
          pct: snapshot.host.memory.usedPercent,
          detail: `${formatBytes(snapshot.host.memory.usedBytes)} / ${formatBytes(snapshot.host.memory.totalBytes)}`,
        },
        {
          key: 'disk',
          label: $t('admin.systemDisk'),
          pct: snapshot.host.disk?.usedPercent ?? 0,
          detail: snapshot.host.disk
            ? `${formatBytes(snapshot.host.disk.usedBytes)} / ${formatBytes(snapshot.host.disk.totalBytes)}`
            : $t('admin.systemDiskUnavailable'),
        },
      ]"
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

  <div class="rounded-xl border border-slate-200 bg-white p-3">
    <div class="flex items-center justify-between mb-2">
      <h3 class="text-xs font-semibold text-slate-700">
        {{ $t("admin.systemTrendTitle") }}
      </h3>
      <p class="text-[11px] text-slate-500">
        {{ $t("admin.systemTrendHint") }}
      </p>
    </div>
    <div class="h-48">
      <canvas ref="trendChart" />
    </div>
    <p
      v-if="history.length < 2"
      class="text-[11px] text-slate-500 text-center -mt-40 relative"
    >
      {{ $t("admin.systemTrendWaiting") }}
    </p>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
    <div
      class="rounded-xl border border-slate-200 bg-white px-3 py-3 space-y-3"
    >
      <h3 class="text-xs font-semibold text-slate-700">
        {{ $t("admin.systemLatency") }}
      </h3>
      <div
        v-for="row in [
          {
            label: $t('admin.systemLatencyDb'),
            ms: snapshot.latency.db.ms,
            ok: snapshot.latency.db.ok,
          },
          {
            label: $t('admin.systemLatencyHealth'),
            ms: snapshot.latency.http.ms,
            ok: snapshot.latency.http.ok,
          },
          {
            label: $t('admin.systemLatencyRedis'),
            ms: snapshot.latency.redis?.ms ?? null,
            ok: snapshot.latency.redis?.ok ?? false,
            skip: snapshot.latency.redis == null,
          },
        ].filter((r) => !('skip' in r && r.skip))"
        :key="row.label"
        class="space-y-1"
      >
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

    <div
      class="rounded-xl border border-slate-200 bg-white px-3 py-3 space-y-3 text-xs text-slate-600"
    >
      <h3 class="text-xs font-semibold text-slate-700">
        {{ $t("admin.systemServices") }}
      </h3>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p class="font-semibold text-slate-700 mb-1">
            {{ $t("admin.systemHealth") }}
          </p>
          <p>
            DB
            <span
              :class="snapshot.health.db ? 'text-emerald-700' : 'text-rose-600'"
              >{{
                snapshot.health.db
                  ? $t("admin.systemOk")
                  : $t("admin.systemFail")
              }}</span
            >
          </p>
          <p>
            {{ $t("admin.systemMigrations") }}
            <span
              :class="
                snapshot.health.migrations.ok
                  ? 'text-emerald-700'
                  : 'text-rose-600'
              "
              >{{
                snapshot.health.migrations.ok
                  ? $t("admin.systemOk")
                  : $t("admin.systemFail")
              }}</span
            >
          </p>
        </div>
        <div class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <p class="font-semibold text-slate-700 mb-1">
            {{ $t("admin.systemCache") }}
          </p>
          <p class="tabular-nums">
            {{ snapshot.cache.driver }}
            · Redis
            {{
              snapshot.cache.redisConfigured
                ? $t("admin.systemConfigured")
                : $t("admin.systemNotConfigured")
            }}
          </p>
        </div>
        <div
          class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 sm:col-span-2"
        >
          <p class="font-semibold text-slate-700 mb-1">
            {{ $t("admin.systemQueue") }}
          </p>
          <p>
            {{
              snapshot.queue.workerEnabled
                ? $t("admin.systemWorkerOn")
                : $t("admin.systemWorkerOff")
            }}
          </p>
          <div class="mt-2 grid grid-cols-4 gap-1 text-center">
            <div
              v-for="cell in [
                {
                  label: 'pending',
                  n: snapshot.queue.jobs.pending,
                  cls: 'text-amber-700',
                },
                {
                  label: 'processing',
                  n: snapshot.queue.jobs.processing,
                  cls: 'text-sky-700',
                },
                {
                  label: 'done',
                  n: snapshot.queue.jobs.completed,
                  cls: 'text-emerald-700',
                },
                {
                  label: 'dead',
                  n: snapshot.queue.jobs.dead,
                  cls: 'text-rose-700',
                },
              ]"
              :key="cell.label"
              class="rounded-md bg-white border border-slate-200 px-1 py-1.5"
            >
              <p class="text-[10px] uppercase text-slate-500">
                {{ cell.label }}
              </p>
              <p class="text-sm font-semibold tabular-nums" :class="cell.cls">
                {{ cell.n }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
