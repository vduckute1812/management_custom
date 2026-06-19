<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import type { Chart as ChartType } from "chart.js";
import { TaskStatus, type Epic, type Task } from "~/types/task";

dayjs.extend(isoWeek);

const props = defineProps<{
  tasks: Task[];
  epics?: Epic[];
  granularity?: "day" | "week" | "month";
}>();

const granularity = computed(() => props.granularity ?? "week");

interface Bucket {
  key: string;
  label: string;
  estimated: number;
  spent: number;
  completed: number;
  rolledOver: number;
}

// Allocate a task's estimatedHours across the period(s) where its blocks live.
// This way, "estimated vs actual per week" reflects when the work is planned,
// not when the task happens to be due.
function estimatedShareForBucket(
  task: Task,
  bucketStart: dayjs.Dayjs,
  unit: "day" | "week" | "month"
): number {
  const blocks = task.timeBlocks ?? [];
  if (!task.estimatedHours || blocks.length === 0) return 0;
  const blocksInBucket = blocks.filter((b) =>
    dayjs(b.start).isSame(bucketStart, unit)
  );
  if (blocksInBucket.length === 0) return 0;
  return (task.estimatedHours * blocksInBucket.length) / blocks.length;
}

const buckets = computed<Bucket[]>(() => {
  const periods = granularity.value === "day" ? 14 : granularity.value === "week" ? 8 : 6;
  const unit = granularity.value;
  const today = dayjs().startOf(unit);
  const result: Bucket[] = [];

  for (let i = periods - 1; i >= 0; i--) {
    const start = today.subtract(i, unit);
    const end = start.endOf(unit);

    let estimated = 0;
    let spent = 0;
    const inBucketTaskIds = new Set<string>();

    for (const t of props.tasks) {
      estimated += estimatedShareForBucket(t, start, unit);
      for (const b of t.timeBlocks ?? []) {
        const bs = dayjs(b.start);
        if (bs.isSame(start, unit)) {
          spent += b.spentHours ?? 0;
          inBucketTaskIds.add(t.id);
        }
      }
    }

    // Tasks whose deadline lands in this bucket — used for completion stats.
    const dueInBucket = props.tasks.filter(
      (t) => t.dueDate && dayjs(t.dueDate).isSame(start, unit)
    );
    const completed = dueInBucket.filter((t) => t.status === TaskStatus.Done).length;
    const rolledOver = dueInBucket.filter(
      (t) =>
        t.status !== TaskStatus.Done && dayjs(t.dueDate).isBefore(end, unit)
    ).length;

    result.push({
      key: start.format("YYYY-MM-DD"),
      label:
        unit === "day"
          ? start.format("MMM D")
          : unit === "week"
          ? `W${start.isoWeek()} ${start.format("MMM D")}`
          : start.format("MMM YYYY"),
      estimated: Math.round(estimated * 10) / 10,
      spent: Math.round(spent * 10) / 10,
      completed,
      rolledOver,
    });
  }
  return result;
});

const totals = computed(() => {
  const tasks = props.tasks;
  const completed = tasks.filter((t) => t.status === TaskStatus.Done).length;
  const inProgress = tasks.filter((t) => t.status === TaskStatus.InProgress).length;
  const todo = tasks.filter((t) => t.status === TaskStatus.Todo).length;
  const totalEstimated = tasks.reduce((s, t) => s + (t.estimatedHours ?? 0), 0);
  const totalSpent = tasks.reduce((s, t) => s + (t.spentHours ?? 0), 0);
  const overdue = tasks.filter(
    (t) =>
      t.status !== TaskStatus.Done &&
      t.dueDate &&
      dayjs(t.dueDate).isBefore(dayjs(), "day")
  ).length;

  const completionRate =
    tasks.length === 0 ? 0 : Math.round((completed / tasks.length) * 100);

  const accuracyTasks = tasks.filter(
    (t) => (t.estimatedHours ?? 0) > 0 && (t.spentHours ?? 0) > 0
  );
  const avgVariance =
    accuracyTasks.length === 0
      ? 0
      : accuracyTasks.reduce(
          (sum, t) =>
            sum + ((t.spentHours ?? 0) - (t.estimatedHours ?? 0)),
          0
        ) / accuracyTasks.length;

  return {
    completed,
    inProgress,
    todo,
    totalEstimated: Math.round(totalEstimated * 10) / 10,
    totalSpent: Math.round(totalSpent * 10) / 10,
    overdue,
    completionRate,
    avgVariance: Math.round(avgVariance * 10) / 10,
  };
});

const epicBreakdown = computed(() => {
  return (props.epics ?? [])
    .map((e) => ({
      epic: e,
      variance:
        Math.round(((e.spentHours ?? 0) - (e.estimatedHours ?? 0)) * 10) / 10,
    }))
    .sort((a, b) => (b.epic.spentHours ?? 0) - (a.epic.spentHours ?? 0));
});

const velocityChart = ref<HTMLCanvasElement | null>(null);
const completionChart = ref<HTMLCanvasElement | null>(null);
let velocityInst: ChartType | null = null;
let completionInst: ChartType | null = null;
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
    mod.CategoryScale,
    mod.LinearScale,
    mod.Tooltip,
    mod.Legend,
    mod.Filler
  );
  ChartCtor = mod.Chart;
  return ChartCtor;
}

async function renderCharts() {
  if (!velocityChart.value || !completionChart.value) return;
  const Chart = await ensureChartLib();
  const labels = buckets.value.map((b) => b.label);

  velocityInst?.destroy();
  velocityInst = new Chart(velocityChart.value, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Estimated hours",
          data: buckets.value.map((b) => b.estimated),
          backgroundColor: "rgba(99, 102, 241, 0.55)",
          borderRadius: 6,
        },
        {
          label: "Actual hours",
          data: buckets.value.map((b) => b.spent),
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

  completionInst?.destroy();
  completionInst = new Chart(completionChart.value, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Completed",
          data: buckets.value.map((b) => b.completed),
          borderColor: "#10b981",
          backgroundColor: "rgba(16, 185, 129, 0.18)",
          fill: true,
          tension: 0.35,
          pointRadius: 3,
        },
        {
          label: "Rolled over",
          data: buckets.value.map((b) => b.rolledOver),
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

onMounted(() => {
  renderCharts();
});
watch([buckets, () => props.granularity], () => {
  renderCharts();
}, { deep: true });
onBeforeUnmount(() => {
  velocityInst?.destroy();
  completionInst?.destroy();
});
</script>

<template>
  <div class="space-y-5">
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div class="bg-white ring-1 ring-slate-200 rounded-xl p-4 shadow-sm">
        <p class="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
          Completion rate
        </p>
        <p class="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">
          {{ totals.completionRate }}%
        </p>
        <p class="text-xs text-slate-500 mt-0.5">
          {{ totals.completed }} done / {{ totals.completed + totals.inProgress + totals.todo }} total
        </p>
      </div>

      <div class="bg-white ring-1 ring-slate-200 rounded-xl p-4 shadow-sm">
        <p class="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
          Estimated vs Actual
        </p>
        <p class="mt-1 text-2xl font-semibold text-slate-900 tabular-nums">
          {{ totals.totalSpent }}h /
          <span class="text-slate-400">{{ totals.totalEstimated }}h</span>
        </p>
        <p
          class="text-xs mt-0.5 tabular-nums"
          :class="totals.avgVariance > 0 ? 'text-rose-600' : 'text-emerald-600'"
        >
          {{ totals.avgVariance > 0 ? "+" : "" }}{{ totals.avgVariance }}h avg variance
        </p>
      </div>

      <div class="bg-white ring-1 ring-slate-200 rounded-xl p-4 shadow-sm">
        <p class="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
          In progress
        </p>
        <p class="mt-1 text-2xl font-semibold text-amber-600 tabular-nums">
          {{ totals.inProgress }}
        </p>
        <p class="text-xs text-slate-500 mt-0.5">
          {{ totals.todo }} still in backlog
        </p>
      </div>

      <div class="bg-white ring-1 ring-slate-200 rounded-xl p-4 shadow-sm">
        <p class="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
          Overdue
        </p>
        <p
          class="mt-1 text-2xl font-semibold tabular-nums"
          :class="totals.overdue > 0 ? 'text-rose-600' : 'text-slate-900'"
        >
          {{ totals.overdue }}
        </p>
        <p class="text-xs text-slate-500 mt-0.5">
          Past due date, not done
        </p>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div class="bg-white ring-1 ring-slate-200 rounded-xl p-4 shadow-sm">
        <header class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-semibold text-slate-800">
            Velocity — estimated vs actual
          </h3>
          <span class="text-[11px] text-slate-500 capitalize">
            per {{ granularity }}
          </span>
        </header>
        <div class="h-64">
          <canvas ref="velocityChart" />
        </div>
      </div>

      <div class="bg-white ring-1 ring-slate-200 rounded-xl p-4 shadow-sm">
        <header class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-semibold text-slate-800">
            Completion vs roll-over
          </h3>
          <span class="text-[11px] text-slate-500 capitalize">
            per {{ granularity }}
          </span>
        </header>
        <div class="h-64">
          <canvas ref="completionChart" />
        </div>
      </div>
    </div>

    <div
      v-if="epicBreakdown.length > 0"
      class="bg-white ring-1 ring-slate-200 rounded-xl shadow-sm"
    >
      <header class="px-4 py-3 border-b border-slate-100">
        <h3 class="text-sm font-semibold text-slate-800">Epic velocity</h3>
        <p class="text-[11px] text-slate-500">
          Derived hours rolled up from each epic's child tasks
        </p>
      </header>
      <ul class="divide-y divide-slate-100">
        <li
          v-for="row in epicBreakdown"
          :key="row.epic.id"
          class="px-4 py-3 flex items-center gap-3"
        >
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-slate-800 truncate">
              {{ row.epic.title }}
            </p>
            <p class="text-[11px] text-slate-500 tabular-nums">
              {{ row.epic.taskCount }} tasks · {{ row.epic.progress }}% progress
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
        </li>
      </ul>
    </div>
  </div>
</template>
