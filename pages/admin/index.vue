<script setup lang="ts">
import {
  UserRole,
  ROLE_I18N_KEYS,
  type AdminUserSummary,
  type AuthUser,
} from "~/types/auth";
import type { TaskStatus } from "~/types/task";

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

const { t } = useI18n();
const { apiFetch } = useApi();
const { pushToast } = useToasts();
const { user: currentUser, isSuperAdmin } = useAuth();

const days = ref<number>(30);
const error = ref<string | null>(null);
const roleBusy = ref<string | null>(null);
const removeBusy = ref<string | null>(null);
const pendingDeleteUser = ref<AdminUserSummary | null>(null);

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
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <AdminPageHeader v-model:days="days" />

    <div class="min-h-0 flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
      <p
        v-if="error"
        class="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2"
      >
        {{ error }}
      </p>

      <AdminSystemMonitor v-if="isSuperAdmin" />

      <AdminOverviewSummary :totals="stats?.totals ?? null" />

      <AdminStatsCharts v-if="stats" :stats="stats" />

      <AdminUsersPanel
        v-if="stats"
        :users="stats.users"
        :role-busy="roleBusy"
        :remove-busy="removeBusy"
        :is-super-admin="isSuperAdmin"
        :current-user-id="currentUser?.id ?? null"
        @role-change="setRole"
        @delete="requestRemoveUser"
      />

      <AdminCategoriesPanel />

      <div v-if="loading" class="py-2" aria-busy="true">
        <SkeletonList :rows="2" />
      </div>
    </div>

    <AdminUserDeleteDialog
      :user="pendingDeleteUser"
      :busy="!!removeBusy"
      @cancel="pendingDeleteUser = null"
      @confirm="confirmRemoveUser"
    />
  </div>
</template>
