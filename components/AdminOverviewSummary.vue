<script setup lang="ts">
defineProps<{
  totals: {
    userCount: number;
    taskCount: number;
    epicCount: number;
    hoursLogged: number;
  } | null;
}>();

const { t } = useI18n();

function formatHours(n: number): string {
  return t("admin.hoursUnit", { hours: Math.round(n * 10) / 10 });
}
</script>

<template>
  <NuxtLink
    to="/admin/articles/pending"
    class="block bg-white border border-slate-200 rounded-xl px-4 py-3 hover:border-slate-300 hover:bg-slate-50/80 transition-colors"
  >
    <p class="text-sm font-semibold text-slate-900">
      {{ $t("admin.pendingArticlesLink") }}
    </p>
    <p class="text-xs text-slate-500 mt-0.5">
      {{ $t("admin.pendingArticlesLinkHint") }}
    </p>
  </NuxtLink>

  <div v-if="totals" class="grid grid-cols-2 md:grid-cols-4 gap-3">
    <div class="bg-white border border-slate-200 rounded-xl px-4 py-3">
      <p class="text-[11px] uppercase tracking-wider text-slate-400">
        {{ $t("admin.users") }}
      </p>
      <p class="text-2xl font-semibold tabular-nums">
        {{ totals.userCount }}
      </p>
    </div>
    <div class="bg-white border border-slate-200 rounded-xl px-4 py-3">
      <p class="text-[11px] uppercase tracking-wider text-slate-400">
        {{ $t("admin.epics") }}
      </p>
      <p class="text-2xl font-semibold tabular-nums">
        {{ totals.epicCount }}
      </p>
    </div>
    <div class="bg-white border border-slate-200 rounded-xl px-4 py-3">
      <p class="text-[11px] uppercase tracking-wider text-slate-400">
        {{ $t("admin.tasks") }}
      </p>
      <p class="text-2xl font-semibold tabular-nums">
        {{ totals.taskCount }}
      </p>
    </div>
    <div class="bg-white border border-slate-200 rounded-xl px-4 py-3">
      <p class="text-[11px] uppercase tracking-wider text-slate-400">
        {{ $t("admin.hoursLogged") }}
      </p>
      <p class="text-2xl font-semibold tabular-nums">
        {{ formatHours(totals.hoursLogged) }}
      </p>
    </div>
  </div>
</template>
