<script setup lang="ts">
defineProps<{
  taskId?: string;
  submitting: boolean;
  justSaved: boolean;
}>();

const emit = defineEmits<{
  (e: "cancel"): void;
  (e: "delete"): void;
  (e: "save"): void;
}>();
</script>

<template>
  <footer
    class="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl"
  >
    <button
      v-if="taskId"
      type="button"
      :disabled="submitting"
      class="text-sm font-medium text-rose-600 hover:text-rose-700 disabled:opacity-50"
      @click="emit('delete')"
    >
      {{ $t("tasks.modal.delete") }}
    </button>
    <span v-else class="text-[11px] text-slate-400">
      <kbd class="px-1.5 py-0.5 bg-slate-100 rounded font-mono">⌘</kbd>
      <kbd class="px-1.5 py-0.5 bg-slate-100 rounded font-mono ml-1">↵</kbd>
      {{ $t("tasks.modal.toSave") }}
    </span>
    <div class="flex items-center gap-2">
      <button
        type="button"
        class="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 rounded-lg transition"
        @click="emit('cancel')"
      >
        {{ $t("tasks.modal.cancel") }}
      </button>
      <button
        type="button"
        :disabled="submitting"
        class="px-4 py-2 text-sm font-medium bg-brand-600 hover:bg-brand-700 text-white rounded-lg shadow-sm disabled:opacity-50 inline-flex items-center gap-2"
        @click="emit('save')"
      >
        <svg
          v-if="justSaved"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="3"
          class="w-4 h-4"
        >
          <polyline
            points="20 6 9 17 4 12"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        {{
          justSaved
            ? $t("tasks.modal.saved")
            : submitting
              ? $t("tasks.modal.saving")
              : taskId
                ? $t("tasks.modal.saveChanges")
                : $t("tasks.modal.createTask")
        }}
      </button>
    </div>
  </footer>
</template>
