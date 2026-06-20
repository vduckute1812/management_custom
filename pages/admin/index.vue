<script setup lang="ts">
import dayjs from "dayjs";
import type { Chart as ChartType } from "chart.js";
import { UserRole, ROLE_LABELS, type AdminUserSummary, type AuthUser } from "~/types/task";

const { apiFetch } = useApi();
const { pushToast } = useToasts();

interface StatsResponse {
  rangeDays: number;
  totals: {
    userCount: number;
    taskCount: number;
    epicCount: number;
    hoursLogged: number;
  };
  users: AdminUserSummary[];
  daily: { date: string; hours: number }[];
  statuses: { status: "todo" | "in-progress" | "done"; count: number }[];
}

const days = ref<number>(30);
const stats = ref<StatsResponse | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const roleBusy = ref<string | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    stats.value = await apiFetch<StatsResponse>(
      `/api/admin/stats?days=${days.value}`
    );
  } catch (err: unknown) {
    error.value =
      (err as { data?: { statusMessage?: string }; statusMessage?: string })
        ?.data?.statusMessage ??
      (err as { statusMessage?: string }).statusMessage ??
      "Failed to load stats";
  } finally {
    loading.value = false;
  }
}

await useAsyncData("admin:initial", () => load());

watch(days, () => load());

function roleChipClass(role: UserRole): string {
  if (role === UserRole.Superadmin) return "bg-indigo-100 text-indigo-700";
  if (role === UserRole.Admin) return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

function roleLabel(role: UserRole): string {
  return ROLE_LABELS[role] ?? String(role);
}

async function setRole(
  user: AdminUserSummary,
  role: typeof UserRole.Admin | typeof UserRole.Normal
) {
  if (user.role === role) return;
  roleBusy.value = user.id;
  try {
    const { user: updated } = await apiFetch<{ ok: true; user: AuthUser }>(
      `/api/admin/users/${user.id}/role`,
      { method: "POST", body: { role } }
    );
    if (stats.value) {
      stats.value.users = stats.value.users.map((u) =>
        u.id === updated.id ? { ...u, role: updated.role } : u
      );
    }
    pushToast(`Role set to ${roleLabel(role)}`, { tone: "success" });
  } catch (err: unknown) {
    pushToast(
      (err as { data?: { statusMessage?: string }; statusMessage?: string })
        ?.data?.statusMessage ??
        (err as { statusMessage?: string }).statusMessage ??
        "Failed to update role",
      { tone: "danger" }
    );
  } finally {
    roleBusy.value = null;
  }
}

// ---- charts ----
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
    mod.Filler
  );
  ChartCtor = mod.Chart;
  return ChartCtor;
}

async function renderCharts() {
  if (!stats.value) return;
  if (!hoursChart.value || !statusChart.value || !usersChart.value) return;
  const Chart = await ensureChartLib();

  hoursInst?.destroy();
  hoursInst = new Chart(hoursChart.value, {
    type: "line",
    data: {
      labels: stats.value.daily.map((d) => dayjs(d.date).format("MMM D")),
      datasets: [
        {
          label: "Hours logged",
          data: stats.value.daily.map((d) => d.hours),
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
      labels: ["To do", "In progress", "Done"],
      datasets: [
        {
          data: stats.value.statuses.map((s) => s.count),
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
      labels: stats.value.users.map((u) => u.name || u.email),
      datasets: [
        {
          label: "Hours logged",
          data: stats.value.users.map((u) => u.hoursLogged),
          backgroundColor: "rgba(99, 102, 241, 0.6)",
          borderRadius: 6,
        },
        {
          label: "Tasks",
          data: stats.value.users.map((u) => u.taskCount),
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

// Two-step chart lifecycle so a freshly-mounted page always paints:
//
// 1. On mount, the canvas template refs become real DOM nodes — render once
//    against whatever `stats` SSR/useAsyncData has already produced.
// 2. The watcher (intentionally NOT `immediate`) only fires for *subsequent*
//    `stats` mutations (i.e. when the user changes the date range). Using
//    `immediate: true` here was the original bug: it ran synchronously during
//    setup, before the canvases existed, so `renderCharts()` early-returned
//    and the page stayed empty until the range was poked.
onMounted(async () => {
  await nextTick();
  await renderCharts();
});

watch(
  () => stats.value,
  async () => {
    await nextTick();
    await renderCharts();
  }
);

onBeforeUnmount(() => {
  hoursInst?.destroy();
  statusInst?.destroy();
  usersInst?.destroy();
});

function formatHours(n: number): string {
  return `${Math.round(n * 10) / 10}h`;
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  return dayjs(iso).format("MMM D, YYYY");
}

// Last-login is much more useful with a relative hint than a bare date:
// admins want to scan for "who hasn't been here in months" at a glance.
// Falls back to the absolute timestamp for the title so the precise value
// is one hover away.
function formatLastLogin(iso?: string): string {
  if (!iso) return "Never";
  const then = dayjs(iso);
  const now = dayjs();
  const diffMin = now.diff(then, "minute");
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = now.diff(then, "hour");
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDay = now.diff(then, "day");
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
  return then.format("MMM D, YYYY");
}

function formatDateTime(iso?: string): string {
  if (!iso) return "Never";
  return dayjs(iso).format("MMM D, YYYY · HH:mm");
}
</script>

<template>
  <div class="flex flex-col h-screen overflow-hidden">
    <header
      class="px-4 md:px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between flex-wrap gap-3"
    >
      <div>
        <h1 class="text-lg font-semibold text-slate-900">Admin dashboard</h1>
        <p class="text-xs text-slate-500">
          System-wide rollups across every user.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <label class="text-xs text-slate-500" for="admin-range">Range</label>
        <select
          id="admin-range"
          v-model.number="days"
          class="text-xs border border-slate-300 rounded-md px-2 py-1.5 bg-white"
        >
          <option :value="7">Last 7 days</option>
          <option :value="14">Last 14 days</option>
          <option :value="30">Last 30 days</option>
          <option :value="90">Last 90 days</option>
        </select>
      </div>
    </header>

    <div class="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
      <p
        v-if="error"
        class="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2"
      >
        {{ error }}
      </p>

      <div v-if="stats" class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div class="bg-white border border-slate-200 rounded-xl px-4 py-3">
          <p class="text-[11px] uppercase tracking-wider text-slate-400">
            Users
          </p>
          <p class="text-2xl font-semibold tabular-nums">
            {{ stats.totals.userCount }}
          </p>
        </div>
        <div class="bg-white border border-slate-200 rounded-xl px-4 py-3">
          <p class="text-[11px] uppercase tracking-wider text-slate-400">
            Epics
          </p>
          <p class="text-2xl font-semibold tabular-nums">
            {{ stats.totals.epicCount }}
          </p>
        </div>
        <div class="bg-white border border-slate-200 rounded-xl px-4 py-3">
          <p class="text-[11px] uppercase tracking-wider text-slate-400">
            Tasks
          </p>
          <p class="text-2xl font-semibold tabular-nums">
            {{ stats.totals.taskCount }}
          </p>
        </div>
        <div class="bg-white border border-slate-200 rounded-xl px-4 py-3">
          <p class="text-[11px] uppercase tracking-wider text-slate-400">
            Hours logged
          </p>
          <p class="text-2xl font-semibold tabular-nums">
            {{ formatHours(stats.totals.hoursLogged) }}
          </p>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div
          class="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-4"
        >
          <h2 class="text-sm font-semibold text-slate-800 mb-2">
            Hours logged per day
          </h2>
          <div class="h-56">
            <canvas ref="hoursChart"></canvas>
          </div>
        </div>
        <div class="bg-white border border-slate-200 rounded-xl p-4">
          <h2 class="text-sm font-semibold text-slate-800 mb-2">
            Task status mix
          </h2>
          <div class="h-56">
            <canvas ref="statusChart"></canvas>
          </div>
        </div>
      </div>

      <div class="bg-white border border-slate-200 rounded-xl p-4">
        <h2 class="text-sm font-semibold text-slate-800 mb-2">
          Per-user activity
        </h2>
        <div class="h-72">
          <canvas ref="usersChart"></canvas>
        </div>
      </div>

      <div
        v-if="stats"
        class="bg-white border border-slate-200 rounded-xl overflow-hidden"
      >
        <table class="min-w-full text-sm">
          <thead class="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th class="text-left px-4 py-2 font-medium">User</th>
              <th class="text-left px-4 py-2 font-medium">Role</th>
              <th class="text-right px-4 py-2 font-medium">Epics</th>
              <th class="text-right px-4 py-2 font-medium">Tasks</th>
              <th class="text-right px-4 py-2 font-medium">Hours</th>
              <th class="text-left px-4 py-2 font-medium">Last activity</th>
              <th class="text-left px-4 py-2 font-medium">Last login</th>
              <th class="text-right px-4 py-2 font-medium">Verified</th>
              <th class="text-right px-4 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="u in stats.users" :key="u.id">
              <td class="px-4 py-2.5">
                <div class="font-medium text-slate-800">
                  {{ u.name || "—" }}
                </div>
                <div class="text-xs text-slate-500">{{ u.email }}</div>
              </td>
              <td class="px-4 py-2.5">
                <span
                  class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
                  :class="roleChipClass(u.role)"
                  >{{ roleLabel(u.role) }}</span
                >
              </td>
              <td class="px-4 py-2.5 text-right tabular-nums">
                {{ u.epicCount }}
              </td>
              <td class="px-4 py-2.5 text-right tabular-nums">
                {{ u.taskCount }}
              </td>
              <td class="px-4 py-2.5 text-right tabular-nums">
                {{ formatHours(u.hoursLogged) }}
              </td>
              <td class="px-4 py-2.5 text-xs text-slate-500">
                {{ formatDate(u.lastActivity) }}
              </td>
              <td
                class="px-4 py-2.5 text-xs text-slate-500"
                :title="formatDateTime(u.lastLoginAt)"
              >
                <span :class="u.lastLoginAt ? '' : 'italic text-slate-400'">
                  {{ formatLastLogin(u.lastLoginAt) }}
                </span>
              </td>
              <td class="px-4 py-2.5 text-right">
                <span
                  class="inline-block w-2 h-2 rounded-full"
                  :class="u.emailVerified ? 'bg-emerald-500' : 'bg-rose-400'"
                ></span>
              </td>
              <td class="px-4 py-2.5 text-right">
                <span
                  v-if="u.role === UserRole.Superadmin"
                  class="text-[11px] text-slate-400"
                  title="The superadmin's role can only be changed by re-running the bootstrap script"
                >—</span>
                <button
                  v-else-if="u.role === UserRole.Normal"
                  type="button"
                  class="text-[11px] px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                  :disabled="roleBusy === u.id"
                  @click="setRole(u, UserRole.Admin)"
                >
                  Promote
                </button>
                <button
                  v-else
                  type="button"
                  class="text-[11px] px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                  :disabled="roleBusy === u.id"
                  @click="setRole(u, UserRole.Normal)"
                >
                  Demote
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p v-if="loading" class="text-xs text-slate-500">Loading…</p>
    </div>
  </div>
</template>
