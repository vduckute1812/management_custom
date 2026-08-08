<script setup lang="ts">
import type { Task } from "~/types/task";

defineProps<{
  task?: Task | null;
  taskId?: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();
</script>

<template>
  <header
    class="flex items-center justify-between px-6 py-4 border-b border-slate-200 gap-3"
  >
    <h2
      id="task-modal-title"
      class="text-lg font-semibold text-slate-900 min-w-0 truncate"
    >
      {{ taskId ? $t("tasks.modal.editTask") : $t("tasks.modal.newTask") }}
    </h2>
    <div class="flex items-center gap-2 shrink-0">
      <TaskTimerButton v-if="task && taskId" :task="task" size="md" />
      <button
        type="button"
        class="text-slate-400 hover:text-slate-700 transition"
        :aria-label="$t('tasks.modal.close')"
        @click="emit('close')"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="w-5 h-5"
        >
          <path d="M6 6l12 12M6 18L18 6" stroke-linecap="round" />
        </svg>
      </button>
    </div>
  </header>
</template>
