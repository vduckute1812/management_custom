<script setup lang="ts">
import type { Chart as ChartType } from "chart.js";
import {
  ANALYTICS_GRANULARITY_KEYS,
  type AnalyticsBucket,
  type AnalyticsGranularity,
} from "~/composables/time/useAnalyticsBuckets";

const props = defineProps<{
  buckets: AnalyticsBucket[];
  granularity: AnalyticsGranularity;
}>();

const { t, locale } = useI18n();

const velocityChart = ref<HTMLCanvasElement | null>(null);
const completionChart = ref<HTMLCanvasElement | null>(null);
let velocityInst: ChartType | null = null;
let completionInst: ChartType | null = null;
let ChartCtor: typeof ChartType | null = null;

/** Stable string so we avoid deep-watching the buckets array. */
const chartFingerprint = computed(() =>
  [
    props.granularity,
    locale.value,
    props.buckets
      .map(
        (b) =>
          `${b.key}:${b.estimated}:${b.spent}:${b.completed}:${b.rolledOver}`,
      )
      .join("|"),
  ].join("#"),
);

async function ensureChartLib() {
  if (ChartCtor) return ChartCtor;
  const mod = await import("chart.js");
  mod.Chart.register(
    mod.BarController,
    mod.BarElement,
    mod.LineController,
    mod.LineElement,
    mod.PointElement,
    mod.CategoryScale,
    mod.LinearScale,
    mod.Tooltip,
    mod.Legend,
    mod.Filler,
  );
  ChartCtor = mod.Chart;
  return ChartCtor;
}

async function renderCharts() {
  if (!velocityChart.value || !completionChart.value) return;
  const Chart = await ensureChartLib();
  const labels = props.buckets.map((b) => b.label);
  const estimated = props.buckets.map((b) => b.estimated);
  const spent = props.buckets.map((b) => b.spent);
  const completed = props.buckets.map((b) => b.completed);
  const rolledOver = props.buckets.map((b) => b.rolledOver);

  if (velocityInst) {
    velocityInst.data.labels = labels;
    const ds0 = velocityInst.data.datasets[0];
    const ds1 = velocityInst.data.datasets[1];
    if (ds0) ds0.data = estimated;
    if (ds1) ds1.data = spent;
    velocityInst.update();
  } else {
    velocityInst = new Chart(velocityChart.value, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: t("analytics.chartEstimatedHours"),
            data: estimated,
            backgroundColor: "rgba(99, 102, 241, 0.55)",
            borderRadius: 6,
          },
          {
            label: t("analytics.chartActualHours"),
            data: spent,
            backgroundColor: "rgba(16, 185, 129, 0.7)",
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom" } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, ticks: { precision: 0 } },
        },
      },
    });
  }

  if (completionInst) {
    completionInst.data.labels = labels;
    const ds0 = completionInst.data.datasets[0];
    const ds1 = completionInst.data.datasets[1];
    if (ds0) ds0.data = completed;
    if (ds1) ds1.data = rolledOver;
    completionInst.update();
  } else {
    completionInst = new Chart(completionChart.value, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: t("analytics.chartCompleted"),
            data: completed,
            borderColor: "#10b981",
            backgroundColor: "rgba(16, 185, 129, 0.18)",
            fill: true,
            tension: 0.35,
            pointRadius: 3,
          },
          {
            label: t("analytics.chartRolledOver"),
            data: rolledOver,
            borderColor: "#f97316",
            backgroundColor: "rgba(249, 115, 22, 0.15)",
            fill: true,
            tension: 0.35,
            pointRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom" } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, ticks: { precision: 0 } },
        },
      },
    });
  }
}

onMounted(() => {
  void renderCharts();
});
watch(chartFingerprint, () => {
  void nextTick(() => renderCharts());
});
onBeforeUnmount(() => {
  velocityInst?.destroy();
  completionInst?.destroy();
  velocityInst = null;
  completionInst = null;
});
</script>

<template>
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
    <div class="bg-white ring-1 ring-slate-200 rounded-xl p-4 shadow-sm">
      <header class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-semibold text-slate-800">
          {{ $t("analytics.velocityTitle") }}
        </h3>
        <span class="text-[11px] text-slate-500 capitalize">
          {{
            $t("analytics.perGranularity", {
              granularity: $t(ANALYTICS_GRANULARITY_KEYS[granularity]),
            })
          }}
        </span>
      </header>
      <div class="h-64">
        <canvas ref="velocityChart" />
      </div>
    </div>

    <div class="bg-white ring-1 ring-slate-200 rounded-xl p-4 shadow-sm">
      <header class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-semibold text-slate-800">
          {{ $t("analytics.completionVsRollover") }}
        </h3>
        <span class="text-[11px] text-slate-500 capitalize">
          {{
            $t("analytics.perGranularity", {
              granularity: $t(ANALYTICS_GRANULARITY_KEYS[granularity]),
            })
          }}
        </span>
      </header>
      <div class="h-64">
        <canvas ref="completionChart" />
      </div>
    </div>
  </div>
</template>
