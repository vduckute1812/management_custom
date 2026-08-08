<script setup lang="ts">
import dayjs from "dayjs";
import type { Chart as ChartType } from "chart.js";
import { STATUS_I18N_KEYS, type TaskStatus } from "~/types/task";

export interface AdminStatsChartsData {
  daily: { date: string; hours: number }[];
  statuses: { status: number; count: number }[];
  users: Array<{
    name: string | null;
    email: string;
    hoursLogged: number;
    taskCount: number;
  }>;
}

const props = defineProps<{
  stats: AdminStatsChartsData;
}>();

const { t, locale } = useI18n();

const hoursChart = ref<HTMLCanvasElement | null>(null);
const statusChart = ref<HTMLCanvasElement | null>(null);
const usersChart = ref<HTMLCanvasElement | null>(null);
let hoursInst: ChartType | null = null;
let statusInst: ChartType | null = null;
let usersInst: ChartType | null = null;
let ChartCtor: typeof ChartType | null = null;

async function ensureChartLib() {
  if (ChartCtor) return ChartCtor;
  const mod = await import("chart.js");
  mod.Chart.register(
    mod.BarController,
    mod.BarElement,
    mod.LineController,
    mod.LineElement,
    mod.PointElement,
    mod.DoughnutController,
    mod.ArcElement,
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
  if (!hoursChart.value || !statusChart.value || !usersChart.value) return;
  const Chart = await ensureChartLib();

  hoursInst?.destroy();
  hoursInst = new Chart(hoursChart.value, {
    type: "line",
    data: {
      labels: props.stats.daily.map((d) => dayjs(d.date).format("MMM D")),
      datasets: [
        {
          label: t("admin.chartHoursLogged"),
          data: props.stats.daily.map((d) => d.hours),
          borderColor: "#6366f1",
          backgroundColor: "rgba(99, 102, 241, 0.18)",
          fill: true,
          tension: 0.35,
          pointRadius: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, ticks: { precision: 0 } },
      },
    },
  });

  statusInst?.destroy();
  statusInst = new Chart(statusChart.value, {
    type: "doughnut",
    data: {
      labels: props.stats.statuses.map((s) =>
        t(STATUS_I18N_KEYS[s.status as TaskStatus] ?? "status.todo"),
      ),
      datasets: [
        {
          data: props.stats.statuses.map((s) => s.count),
          backgroundColor: ["#cbd5e1", "#f59e0b", "#10b981"],
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: { legend: { position: "bottom" } },
    },
  });

  usersInst?.destroy();
  usersInst = new Chart(usersChart.value, {
    type: "bar",
    data: {
      labels: props.stats.users.map((u) => u.name || u.email),
      datasets: [
        {
          label: t("admin.chartHoursLogged"),
          data: props.stats.users.map((u) => u.hoursLogged),
          backgroundColor: "rgba(99, 102, 241, 0.6)",
          borderRadius: 6,
        },
        {
          label: t("admin.chartTasks"),
          data: props.stats.users.map((u) => u.taskCount),
          backgroundColor: "rgba(16, 185, 129, 0.6)",
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

// Render once stats and all three canvases are available. Watching the canvas
// refs (not just stats) covers both orderings: stats may arrive before mount,
// or canvases may bind after stats was already set during setup. `flush:
// 'post'` waits until after DOM updates so template refs are populated.
watch(
  [() => props.stats, hoursChart, statusChart, usersChart, locale],
  () => {
    void renderCharts();
  },
  { flush: "post" },
);

onBeforeUnmount(() => {
  hoursInst?.destroy();
  statusInst?.destroy();
  usersInst?.destroy();
});
</script>

<template>
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
    <div class="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-4">
      <h2 class="text-sm font-semibold text-slate-800 mb-2">
        {{ $t("admin.hoursLoggedPerDay") }}
      </h2>
      <div class="h-56">
        <canvas ref="hoursChart" />
      </div>
    </div>
    <div class="bg-white border border-slate-200 rounded-xl p-4">
      <h2 class="text-sm font-semibold text-slate-800 mb-2">
        {{ $t("admin.taskStatusMix") }}
      </h2>
      <div class="h-56">
        <canvas ref="statusChart" />
      </div>
    </div>
  </div>

  <div class="bg-white border border-slate-200 rounded-xl p-4">
    <h2 class="text-sm font-semibold text-slate-800 mb-2">
      {{ $t("admin.perUserActivity") }}
    </h2>
    <div class="h-72">
      <canvas ref="usersChart" />
    </div>
  </div>
</template>
