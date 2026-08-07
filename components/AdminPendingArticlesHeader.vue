<script setup lang="ts">
defineProps<{
  dailyFetchEnabled: boolean;
  selectedCount: number;
  busyToggle: boolean;
  busyDelete: boolean;
  busyFetch: boolean;
  loading: boolean;
}>();

const emit = defineEmits<{
  toggleDailyFetch: [];
  bulkDelete: [];
  fetchNow: [];
  refresh: [];
}>();
</script>

<template>
  <header
    class="px-4 md:px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between flex-wrap gap-3 shrink-0"
  >
    <div>
      <div class="flex items-center gap-2 text-xs text-slate-500 mb-1">
        <NuxtLink to="/admin" class="hover:text-slate-800">
          {{ $t("admin.title") }}
        </NuxtLink>
        <span>/</span>
        <span>{{ $t("adminArticles.breadcrumb") }}</span>
      </div>
      <h1 class="text-lg font-semibold text-slate-900">
        {{ $t("adminArticles.title") }}
      </h1>
      <p class="text-xs text-slate-500">
        {{ $t("adminArticles.subtitle") }}
      </p>
    </div>
    <div class="flex items-center gap-2 flex-wrap">
      <button
        type="button"
        class="text-xs px-3 py-1.5 rounded-md border disabled:opacity-50"
        :class="
          dailyFetchEnabled
            ? 'border-emerald-300 text-emerald-800 bg-emerald-50 hover:bg-emerald-100'
            : 'border-slate-300 text-slate-600 bg-white hover:bg-slate-50'
        "
        :disabled="busyToggle || busyDelete || busyFetch"
        :aria-pressed="dailyFetchEnabled"
        :title="$t('adminArticles.dailyFetchHint')"
        @click="emit('toggleDailyFetch')"
      >
        {{
          busyToggle
            ? $t("common.saving")
            : dailyFetchEnabled
              ? $t("adminArticles.dailyFetchEnabled")
              : $t("adminArticles.dailyFetchDisabled")
        }}
      </button>
      <button
        v-if="selectedCount > 0"
        type="button"
        class="text-xs px-3 py-1.5 rounded-md border border-rose-200 text-rose-700 bg-white hover:bg-rose-50 disabled:opacity-50"
        :disabled="busyDelete || busyFetch || busyToggle"
        @click="emit('bulkDelete')"
      >
        {{
          busyDelete
            ? $t("common.deleting")
            : $t("adminArticles.bulkDelete", { count: selectedCount })
        }}
      </button>
      <button
        type="button"
        class="text-xs px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50"
        :disabled="busyFetch || busyDelete || busyToggle"
        @click="emit('fetchNow')"
      >
        {{
          busyFetch
            ? $t("adminArticles.fetching")
            : $t("adminArticles.fetchNow")
        }}
      </button>
      <button
        type="button"
        class="text-xs px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50"
        :disabled="loading || busyDelete || busyToggle"
        @click="emit('refresh')"
      >
        {{ $t("adminArticles.refresh") }}
      </button>
    </div>
  </header>
</template>
