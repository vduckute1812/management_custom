<script setup lang="ts">
import type { CalendarView } from "~/types/task";

defineProps<{
  headerLabel: string;
  view: CalendarView;
  isNarrow: boolean;
  stats: { total: number; inProgress: number; done: number };
  epicCount: number;
}>();

const emit = defineEmits<{
  "set-view": [view: CalendarView];
  step: [direction: 1 | -1];
  today: [];
  "quick-capture": [];
}>();

const VIEW_I18N_KEYS: Record<CalendarView, string> = {
  daily: "tasks.viewDaily",
  weekly: "tasks.viewWeekly",
  monthly: "tasks.viewMonthly",
};
</script>

<template>
  <header
    class="px-4 md:px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between gap-3 flex-wrap"
  >
    <div>
      <h1 class="text-xl font-semibold text-slate-900">
        {{ headerLabel }}
      </h1>
      <p class="text-xs text-slate-500 mt-0.5">
        {{
          $t("tasks.statsLine", {
            total: stats.total,
            inProgress: stats.inProgress,
            done: stats.done,
            epics: epicCount,
          })
        }}
      </p>
    </div>

    <div class="flex items-center gap-2 flex-wrap justify-end">
      <div class="inline-flex rounded-lg ring-1 ring-slate-200 overflow-hidden">
        <button
          v-for="opt in ['daily', 'weekly', 'monthly'] as const"
          :key="opt"
          class="px-3 py-1.5 text-xs font-medium capitalize transition disabled:opacity-40 disabled:cursor-not-allowed"
          :class="
            view === opt
              ? 'bg-brand-600 text-white'
              : 'bg-white text-slate-600 hover:bg-slate-50'
          "
          :disabled="isNarrow && opt !== 'daily'"
          :title="
            isNarrow && opt !== 'daily'
              ? $t('tasks.availableOnLargerScreens')
              : undefined
          "
          @click="emit('set-view', opt)"
        >
          {{ $t(VIEW_I18N_KEYS[opt]) }}
        </button>
      </div>

      <div class="inline-flex items-center gap-1 ml-1">
        <button
          class="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600"
          :aria-label="$t('tasks.previous')"
          @click="emit('step', -1)"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="w-4 h-4"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <button
          class="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-100"
          @click="emit('today')"
        >
          {{ $t("tasks.today") }}
        </button>
        <button
          class="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600"
          :aria-label="$t('tasks.next')"
          @click="emit('step', 1)"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="w-4 h-4"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      <button
        class="ml-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-600 hover:bg-brand-700 text-white shadow-sm"
        @click="emit('quick-capture')"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          class="w-4 h-4"
        >
          <path d="M12 5v14M5 12h14" stroke-linecap="round" />
        </svg>
        {{ $t("tasks.quickCapture.button") }}
        <kbd
          class="hidden sm:inline px-1 py-0.5 bg-white/20 rounded text-[10px] font-mono"
          >n</kbd
        >
      </button>
    </div>
  </header>
</template>
