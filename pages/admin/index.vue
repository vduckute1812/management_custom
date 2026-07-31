<script setup lang="ts">
import dayjs from "dayjs";
import type { Chart as ChartType } from "chart.js";
import {
  UserRole,
  ROLE_I18N_KEYS,
  STATUS_I18N_KEYS,
  TaskStatus,
  type AdminUserSummary,
  type AuthUser,
} from "~/types/task";

import type { PostCategory } from "~/types/post";

const { t, locale } = useI18n();
const { apiFetch } = useApi();
const { pushToast } = useToasts();
const { user: currentUser, isSuperAdmin } = useAuth();
const {
  categories,
  loading: categoriesLoading,
  refresh: refreshCategories,
  createCategory,
  updateCategory,
  removeCategory,
} = useCategories();

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
  statuses: { status: TaskStatus; count: number }[];
}

const days = ref<number>(30);
const error = ref<string | null>(null);
const roleBusy = ref<string | null>(null);
const removeBusy = ref<string | null>(null);
const pendingDeleteUser = ref<AdminUserSummary | null>(null);
const pendingDeleteCategory = ref<PostCategory | null>(null);
const renameTarget = ref<PostCategory | null>(null);
const renameName = ref("");
const renameRoot = ref<HTMLElement | null>(null);
const renameInput = ref<HTMLInputElement | null>(null);
const renameOpen = computed(() => !!renameTarget.value);

useSeoMeta({
  title: () => t("seo.admin"),
  description: () => t("seo.adminDescription"),
});

const {
  data: stats,
  pending: loading,
  refresh,
} = await useAsyncData(
  "admin:stats",
  async () => {
    error.value = null;
    try {
      return await apiFetch<StatsResponse>(
        `/api/admin/stats?days=${days.value}`,
      );
    } catch (err: unknown) {
      error.value =
        (err as { data?: { statusMessage?: string }; statusMessage?: string })
          ?.data?.statusMessage ??
        (err as { statusMessage?: string }).statusMessage ??
        t("admin.failedToLoadStats");
      return null;
    }
  },
  { watch: [days] },
);

function roleChipClass(role: UserRole): string {
  if (role === UserRole.Superadmin) return "bg-indigo-100 text-indigo-700";
  if (role === UserRole.Admin) return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

function roleLabel(role: UserRole): string {
  return t(ROLE_I18N_KEYS[role] ?? "roles.normal");
}

async function setRole(
  user: AdminUserSummary,
  role: typeof UserRole.Admin | typeof UserRole.Normal,
) {
  if (user.role === role) return;
  roleBusy.value = user.id;
  try {
    const { user: updated } = await apiFetch<{ ok: true; user: AuthUser }>(
      `/api/admin/users/${user.id}/role`,
      { method: "POST", body: { role } },
    );
    if (stats.value) {
      stats.value.users = stats.value.users.map((u) =>
        u.id === updated.id ? { ...u, role: updated.role } : u,
      );
    }
    pushToast(t("toasts.roleSetTo", { role: roleLabel(role) }), {
      tone: "success",
    });
  } catch (err: unknown) {
    pushToast(
      (err as { data?: { statusMessage?: string }; statusMessage?: string })
        ?.data?.statusMessage ??
        (err as { statusMessage?: string }).statusMessage ??
        t("admin.failedToUpdateRole"),
      { tone: "danger" },
    );
  } finally {
    roleBusy.value = null;
  }
}

function requestRemoveUser(user: AdminUserSummary) {
  if (removeBusy.value) return;
  pendingDeleteUser.value = user;
}

async function confirmRemoveUser() {
  const user = pendingDeleteUser.value;
  if (!user) return;
  removeBusy.value = user.id;
  try {
    await apiFetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
    pendingDeleteUser.value = null;
    pushToast(t("toasts.userRemoved"), { tone: "success" });
    await refresh();
  } catch (err: unknown) {
    pushToast(
      (err as { data?: { statusMessage?: string }; statusMessage?: string })
        ?.data?.statusMessage ??
        (err as { statusMessage?: string }).statusMessage ??
        t("admin.failedToRemoveUser"),
      { tone: "danger" },
    );
  } finally {
    removeBusy.value = null;
  }
}

function canRemoveUser(user: AdminUserSummary): boolean {
  return (
    isSuperAdmin.value &&
    user.role !== UserRole.Superadmin &&
    user.id !== currentUser.value?.id
  );
}

// ---- article directories (post categories) ----

const newCategoryName = ref("");
const categoryBusy = ref<string | null>(null);

useModal(renameOpen, {
  container: renameRoot,
  initialFocus: renameInput,
  onClose: () => {
    if (!categoryBusy.value) renameTarget.value = null;
  },
});

onMounted(() => {
  refreshCategories().catch(() => undefined);
});

function apiErrorMessage(err: unknown, fallback: string): string {
  return (
    (err as { data?: { statusMessage?: string }; statusMessage?: string })?.data
      ?.statusMessage ??
    (err as { statusMessage?: string }).statusMessage ??
    fallback
  );
}

async function onAddCategory() {
  const name = newCategoryName.value.trim();
  if (!name || categoryBusy.value) return;
  categoryBusy.value = "new";
  try {
    await createCategory({ name });
    newCategoryName.value = "";
    pushToast(t("admin.categoryCreated"), { tone: "success" });
  } catch (err: unknown) {
    pushToast(apiErrorMessage(err, t("admin.categorySaveFailed")), {
      tone: "danger",
    });
  } finally {
    categoryBusy.value = null;
  }
}

async function onRenameCategory(cat: PostCategory) {
  renameTarget.value = cat;
  renameName.value = cat.name;
}

async function confirmRenameCategory() {
  const cat = renameTarget.value;
  const name = renameName.value.trim();
  if (!cat || !name || name === cat.name) {
    renameTarget.value = null;
    return;
  }
  categoryBusy.value = cat.id;
  try {
    await updateCategory(cat.id, { name });
    renameTarget.value = null;
    pushToast(t("admin.categoryRenamed"), { tone: "success" });
  } catch (err: unknown) {
    pushToast(apiErrorMessage(err, t("admin.categorySaveFailed")), {
      tone: "danger",
    });
  } finally {
    categoryBusy.value = null;
  }
}

function requestDeleteCategory(cat: PostCategory) {
  if (categoryBusy.value) return;
  pendingDeleteCategory.value = cat;
}

async function confirmDeleteCategory() {
  const cat = pendingDeleteCategory.value;
  if (!cat) return;
  categoryBusy.value = cat.id;
  try {
    await removeCategory(cat.id);
    pendingDeleteCategory.value = null;
    pushToast(t("admin.categoryDeleted"), { tone: "success" });
  } catch (err: unknown) {
    pushToast(apiErrorMessage(err, t("admin.categorySaveFailed")), {
      tone: "danger",
    });
  } finally {
    categoryBusy.value = null;
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
    mod.Filler,
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
          label: t("admin.chartHoursLogged"),
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
      labels: stats.value.statuses.map((s) =>
        t(STATUS_I18N_KEYS[s.status] ?? "status.todo"),
      ),
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
          label: t("admin.chartHoursLogged"),
          data: stats.value.users.map((u) => u.hoursLogged),
          backgroundColor: "rgba(99, 102, 241, 0.6)",
          borderRadius: 6,
        },
        {
          label: t("admin.chartTasks"),
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

// Render once stats and all three canvases are available. Watching the canvas
// refs (not just stats) covers both orderings: stats may arrive before mount,
// or canvases may bind after stats was already set during setup. `flush:
// 'post'` waits until after DOM updates so template refs are populated.
watch(
  [stats, hoursChart, statusChart, usersChart, locale],
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

function formatHours(n: number): string {
  return t("admin.hoursUnit", { hours: Math.round(n * 10) / 10 });
}

function formatDate(iso?: string): string {
  if (!iso) return t("common.emDash");
  return dayjs(iso).format("MMM D, YYYY");
}

// Last-login is much more useful with a relative hint than a bare date:
// admins want to scan for "who hasn't been here in months" at a glance.
// Falls back to the absolute timestamp for the title so the precise value
// is one hover away.
function formatLastLogin(iso?: string): string {
  if (!iso) return t("admin.never");
  const then = dayjs(iso);
  const now = dayjs();
  const diffMin = now.diff(then, "minute");
  if (diffMin < 1) return t("admin.justNow");
  if (diffMin < 60) return t("admin.minAgo", { count: diffMin });
  const diffHr = now.diff(then, "hour");
  if (diffHr < 24) return t("admin.hrAgo", { count: diffHr });
  const diffDay = now.diff(then, "day");
  if (diffDay < 7) return t("admin.dayAgo", diffDay);
  return then.format("MMM D, YYYY");
}

function formatDateTime(iso?: string): string {
  if (!iso) return t("admin.never");
  return dayjs(iso).format("MMM D, YYYY · HH:mm");
}
</script>

<template>
  <div class="flex flex-col h-screen overflow-hidden">
    <header
      class="px-4 md:px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between flex-wrap gap-3"
    >
      <div>
        <h1 class="text-lg font-semibold text-slate-900">
          {{ $t("admin.title") }}
        </h1>
        <p class="text-xs text-slate-500">
          {{ $t("admin.subtitle") }}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <label class="text-xs text-slate-500" for="admin-range">{{
          $t("admin.range")
        }}</label>
        <select
          id="admin-range"
          v-model.number="days"
          class="text-xs border border-slate-300 rounded-md px-2 py-1.5 bg-white"
        >
          <option :value="7">{{ $t("admin.last7Days") }}</option>
          <option :value="14">{{ $t("admin.last14Days") }}</option>
          <option :value="30">{{ $t("admin.last30Days") }}</option>
          <option :value="90">{{ $t("admin.last90Days") }}</option>
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
            {{ $t("admin.users") }}
          </p>
          <p class="text-2xl font-semibold tabular-nums">
            {{ stats.totals.userCount }}
          </p>
        </div>
        <div class="bg-white border border-slate-200 rounded-xl px-4 py-3">
          <p class="text-[11px] uppercase tracking-wider text-slate-400">
            {{ $t("admin.epics") }}
          </p>
          <p class="text-2xl font-semibold tabular-nums">
            {{ stats.totals.epicCount }}
          </p>
        </div>
        <div class="bg-white border border-slate-200 rounded-xl px-4 py-3">
          <p class="text-[11px] uppercase tracking-wider text-slate-400">
            {{ $t("admin.tasks") }}
          </p>
          <p class="text-2xl font-semibold tabular-nums">
            {{ stats.totals.taskCount }}
          </p>
        </div>
        <div class="bg-white border border-slate-200 rounded-xl px-4 py-3">
          <p class="text-[11px] uppercase tracking-wider text-slate-400">
            {{ $t("admin.hoursLogged") }}
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
            {{ $t("admin.hoursLoggedPerDay") }}
          </h2>
          <div class="h-56">
            <canvas ref="hoursChart"></canvas>
          </div>
        </div>
        <div class="bg-white border border-slate-200 rounded-xl p-4">
          <h2 class="text-sm font-semibold text-slate-800 mb-2">
            {{ $t("admin.taskStatusMix") }}
          </h2>
          <div class="h-56">
            <canvas ref="statusChart"></canvas>
          </div>
        </div>
      </div>

      <div class="bg-white border border-slate-200 rounded-xl p-4">
        <h2 class="text-sm font-semibold text-slate-800 mb-2">
          {{ $t("admin.perUserActivity") }}
        </h2>
        <div class="h-72">
          <canvas ref="usersChart"></canvas>
        </div>
      </div>

      <div
        v-if="stats"
        class="bg-white border border-slate-200 rounded-xl overflow-x-auto"
      >
        <table class="min-w-full text-sm">
          <thead
            class="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500"
          >
            <tr>
              <th class="text-left px-4 py-2 font-medium">
                {{ $t("admin.colUser") }}
              </th>
              <th class="text-left px-4 py-2 font-medium">
                {{ $t("admin.colRole") }}
              </th>
              <th class="text-right px-4 py-2 font-medium">
                {{ $t("admin.colEpics") }}
              </th>
              <th class="text-right px-4 py-2 font-medium">
                {{ $t("admin.colTasks") }}
              </th>
              <th class="text-right px-4 py-2 font-medium">
                {{ $t("admin.colHours") }}
              </th>
              <th class="text-left px-4 py-2 font-medium">
                {{ $t("admin.colLastActivity") }}
              </th>
              <th class="text-left px-4 py-2 font-medium">
                {{ $t("admin.colLastLogin") }}
              </th>
              <th class="text-right px-4 py-2 font-medium">
                {{ $t("admin.colVerified") }}
              </th>
              <th class="text-right px-4 py-2 font-medium">
                {{ $t("admin.colActions") }}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="u in stats.users" :key="u.id">
              <td class="px-4 py-2.5">
                <div class="font-medium text-slate-800">
                  {{ u.name || $t("common.emDash") }}
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
                <div
                  class="inline-flex items-center justify-end gap-1.5 flex-wrap"
                >
                  <span
                    v-if="u.role === UserRole.Superadmin"
                    class="text-[11px] text-slate-400"
                    :title="$t('admin.superadminLocked')"
                    >{{ $t("common.emDash") }}</span
                  >
                  <template v-else>
                    <button
                      v-if="u.role === UserRole.Normal"
                      type="button"
                      class="text-[11px] px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                      :disabled="roleBusy === u.id || removeBusy === u.id"
                      @click="setRole(u, UserRole.Admin)"
                    >
                      {{ $t("admin.promote") }}
                    </button>
                    <button
                      v-else
                      type="button"
                      class="text-[11px] px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                      :disabled="roleBusy === u.id || removeBusy === u.id"
                      @click="setRole(u, UserRole.Normal)"
                    >
                      {{ $t("admin.demote") }}
                    </button>
                  </template>
                  <button
                    v-if="canRemoveUser(u)"
                    type="button"
                    class="text-[11px] px-2 py-1 rounded border border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                    :disabled="roleBusy === u.id || removeBusy === u.id"
                    @click="requestRemoveUser(u)"
                  >
                    {{ $t("admin.remove") }}
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div>
          <h2 class="text-sm font-semibold text-slate-800">
            {{ $t("admin.categoriesTitle") }}
          </h2>
          <p class="text-xs text-slate-500">
            {{ $t("admin.categoriesSubtitle") }}
          </p>
        </div>

        <form class="flex gap-2" @submit.prevent="onAddCategory">
          <label class="sr-only" for="new-category-name">
            {{ $t("admin.categoryNameLabel") }}
          </label>
          <input
            id="new-category-name"
            v-model="newCategoryName"
            type="text"
            maxlength="120"
            class="flex-1 max-w-xs rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
            :placeholder="$t('admin.categoryNamePlaceholder')"
            :disabled="categoryBusy === 'new'"
          />
          <button
            type="submit"
            class="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            :disabled="!newCategoryName.trim() || categoryBusy === 'new'"
          >
            {{ $t("admin.categoryAdd") }}
          </button>
        </form>

        <div v-if="categoriesLoading && !categories.length" aria-busy="true">
          <SkeletonList :rows="4" />
        </div>
        <table v-else class="min-w-full text-sm">
          <thead
            class="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500"
          >
            <tr>
              <th class="text-left px-3 py-2 font-medium">
                {{ $t("admin.categoryColName") }}
              </th>
              <th class="text-left px-3 py-2 font-medium">
                {{ $t("admin.categoryColSlug") }}
              </th>
              <th class="text-right px-3 py-2 font-medium">
                {{ $t("admin.categoryColArticles") }}
              </th>
              <th class="text-right px-3 py-2 font-medium">
                {{ $t("admin.colActions") }}
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="cat in categories" :key="cat.id">
              <td class="px-3 py-2 font-medium text-slate-800">
                {{ cat.name }}
              </td>
              <td class="px-3 py-2 text-xs text-slate-500">{{ cat.slug }}</td>
              <td class="px-3 py-2 text-right tabular-nums">
                {{ cat.postCount ?? 0 }}
              </td>
              <td class="px-3 py-2 text-right">
                <div class="inline-flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    class="text-[11px] px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                    :disabled="categoryBusy === cat.id"
                    @click="onRenameCategory(cat)"
                  >
                    {{ $t("admin.categoryRename") }}
                  </button>
                  <button
                    type="button"
                    class="text-[11px] px-2 py-1 rounded border border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                    :disabled="categoryBusy === cat.id"
                    @click="requestDeleteCategory(cat)"
                  >
                    {{ $t("admin.remove") }}
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="!categories.length">
              <td colspan="4" class="px-3 py-3 text-xs italic text-slate-400">
                {{ $t("admin.categoryEmpty") }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p v-if="loading" class="text-xs text-slate-500">
        {{ $t("admin.loading") }}
      </p>
    </div>

    <ConfirmDialog
      :open="!!pendingDeleteUser"
      :title="$t('admin.deleteConfirmTitle')"
      :description="
        pendingDeleteUser
          ? $t('admin.deleteConfirm', {
              name: pendingDeleteUser.name || pendingDeleteUser.email,
            })
          : ''
      "
      :busy="!!removeBusy"
      :confirm-label="$t('admin.remove')"
      @cancel="pendingDeleteUser = null"
      @confirm="confirmRemoveUser"
    />

    <ConfirmDialog
      :open="!!pendingDeleteCategory"
      :title="$t('admin.categoryDeleteConfirmTitle')"
      :description="
        pendingDeleteCategory
          ? $t('admin.categoryDeleteConfirm', {
              name: pendingDeleteCategory.name,
              count: pendingDeleteCategory.postCount ?? 0,
            })
          : ''
      "
      :busy="!!categoryBusy"
      @cancel="pendingDeleteCategory = null"
      @confirm="confirmDeleteCategory"
    />

    <Teleport to="body">
      <div
        v-if="renameTarget"
        ref="renameRoot"
        class="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-rename-title"
        @mousedown="
          (e) => {
            if (e.target === e.currentTarget && !categoryBusy)
              renameTarget = null;
          }
        "
      >
        <form
          class="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl ring-1 ring-slate-200"
          @submit.prevent="confirmRenameCategory"
        >
          <h3
            id="admin-rename-title"
            class="text-sm font-semibold text-slate-900"
          >
            {{ $t("admin.categoryRenameTitle") }}
          </h3>
          <label
            class="mt-3 block text-xs font-medium text-slate-600"
            for="admin-rename-input"
          >
            {{ $t("admin.categoryRenameName") }}
          </label>
          <input
            id="admin-rename-input"
            ref="renameInput"
            v-model="renameName"
            type="text"
            required
            maxlength="80"
            class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 outline-none"
            :disabled="!!categoryBusy"
          />
          <div class="mt-4 flex justify-end gap-2">
            <button
              type="button"
              class="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              :disabled="!!categoryBusy"
              @click="renameTarget = null"
            >
              {{ $t("common.cancel") }}
            </button>
            <button
              type="submit"
              class="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              :disabled="!!categoryBusy || !renameName.trim()"
            >
              {{ $t("admin.categoryRenameSave") }}
            </button>
          </div>
        </form>
      </div>
    </Teleport>
  </div>
</template>
