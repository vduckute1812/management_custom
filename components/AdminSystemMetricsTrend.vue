<script setup lang="ts">
import type { Chart as ChartType } from "chart.js";

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
  const muted = styles.getPropertyValue("--ink-muted").trim() || "#64748b";
  const border = styles.getPropertyValue("--border").trim() || "#e2e8f0";
  return { muted, border };
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
</template>
