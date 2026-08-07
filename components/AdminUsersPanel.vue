<script setup lang="ts">
import dayjs from "dayjs";
import { ROLE_I18N_KEYS, UserRole, type AdminUserSummary } from "~/types/auth";

const props = defineProps<{
  users: AdminUserSummary[];
  roleBusy: string | null;
  removeBusy: string | null;
  isSuperAdmin: boolean;
  currentUserId: string | null;
}>();

const emit = defineEmits<{
  roleChange: [
    user: AdminUserSummary,
    role: typeof UserRole.Admin | typeof UserRole.Normal,
  ];
  delete: [user: AdminUserSummary];
}>();

const { t } = useI18n();

function roleChipClass(role: UserRole): string {
  if (role === UserRole.Superadmin) return "bg-indigo-100 text-indigo-700";
  if (role === UserRole.Admin) return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

function roleLabel(role: UserRole): string {
  return t(ROLE_I18N_KEYS[role] ?? "roles.normal");
}

function canRemoveUser(user: AdminUserSummary): boolean {
  return (
    props.isSuperAdmin &&
    user.role !== UserRole.Superadmin &&
    user.id !== props.currentUserId
  );
}

function formatHours(n: number): string {
  return t("admin.hoursUnit", { hours: Math.round(n * 10) / 10 });
}

function formatDate(iso?: string): string {
  if (!iso) return t("common.emDash");
  return dayjs(iso).format("MMM D, YYYY");
}

// Relative last-login text makes stale accounts easier to scan in the table.
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
  <div class="bg-white border border-slate-200 rounded-xl overflow-x-auto">
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
        <tr v-for="u in users" :key="u.id">
          <td class="px-4 py-2.5">
            <div class="font-medium text-slate-800">
              {{ u.name || $t("common.emDash") }}
            </div>
            <div class="text-xs text-slate-500">
              {{ u.email }}
            </div>
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
            />
          </td>
          <td class="px-4 py-2.5 text-right">
            <div class="inline-flex items-center justify-end gap-1.5 flex-wrap">
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
                  @click="emit('roleChange', u, UserRole.Admin)"
                >
                  {{ $t("admin.promote") }}
                </button>
                <button
                  v-else
                  type="button"
                  class="text-[11px] px-2 py-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
                  :disabled="roleBusy === u.id || removeBusy === u.id"
                  @click="emit('roleChange', u, UserRole.Normal)"
                >
                  {{ $t("admin.demote") }}
                </button>
              </template>
              <button
                v-if="canRemoveUser(u)"
                type="button"
                class="text-[11px] px-2 py-1 rounded border border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                :disabled="roleBusy === u.id || removeBusy === u.id"
                @click="emit('delete', u)"
              >
                {{ $t("admin.remove") }}
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
