<script setup lang="ts">
import type { SystemLogEntry } from "~/types/system";

type LogFilter = "all" | "error" | "warn" | "info";

defineProps<{
  logs: SystemLogEntry[];
  loading: boolean;
  error: string | null;
}>();

const logFilter = defineModel<LogFilter>("logFilter", { required: true });
const emit = defineEmits<{
  (e: "reload"): void;
}>();

function levelClass(level: string): string {
  if (level === "error") return "text-rose-600";
  if (level === "warn") return "text-amber-600";
  if (level === "info") return "text-sky-700";
  return "text-slate-500";
}
</script>

<template>
  <div class="rounded-xl border border-slate-200 overflow-hidden">
    <div
      class="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-slate-200 bg-slate-50"
    >
      <div>
        <h3 class="text-xs font-semibold text-slate-700">
          {{ $t("admin.systemLogsTitle") }}
        </h3>
        <p class="text-[11px] text-slate-500">
          {{ $t("admin.systemLogsHint") }}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <label class="sr-only" for="admin-log-filter">{{
          $t("admin.systemLogsFilter")
        }}</label>
        <select
          id="admin-log-filter"
          v-model="logFilter"
          class="text-xs border border-slate-300 rounded-md px-2 py-1 bg-white"
        >
          <option value="all">
            {{ $t("admin.systemLogsAll") }}
          </option>
          <option value="error">error</option>
          <option value="warn">warn</option>
          <option value="info">info</option>
        </select>
        <button
          type="button"
          class="text-xs font-semibold rounded-md border border-slate-200 bg-white px-2 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          :disabled="loading"
          @click="emit('reload')"
        >
          {{ $t("common.reload") }}
        </button>
      </div>
    </div>
    <p v-if="error" class="text-xs text-rose-600 px-3 py-2 bg-rose-50">
      {{ error }}
    </p>
    <div
      class="max-h-64 overflow-auto bg-slate-950 text-[11px] font-mono leading-relaxed"
    >
      <div v-if="loading && !logs.length" class="bg-white">
        <SkeletonList :rows="4" />
      </div>
      <p v-else-if="!logs.length" class="px-3 py-4 text-slate-400">
        {{ $t("admin.systemLogsEmpty") }}
      </p>
      <div
        v-for="(entry, idx) in logs"
        :key="`${entry.at}-${idx}`"
        class="px-3 py-0.5 border-b border-slate-900/80 hover:bg-slate-900"
      >
        <span class="text-slate-500">{{
          new Date(entry.at).toLocaleTimeString()
        }}</span>
        <span class="ml-2 uppercase" :class="levelClass(entry.level)">{{
          entry.level
        }}</span>
        <span class="ml-2 text-slate-200 whitespace-pre-wrap break-all">{{
          entry.message
        }}</span>
      </div>
    </div>
  </div>
</template>
