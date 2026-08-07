<script setup lang="ts">
import { EPIC_COLOR_CLASSES, type EpicColor } from "~/types/task";

defineProps<{
  epicId?: string;
  color: EpicColor;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();
</script>

<template>
  <header
    class="flex items-center justify-between px-6 py-4 border-b border-slate-200"
  >
    <h2
      id="epic-modal-title"
      class="text-lg font-semibold text-slate-900 flex items-center gap-2"
    >
      <span
        class="w-2.5 h-2.5 rounded-full"
        :class="EPIC_COLOR_CLASSES[color].solid"
        aria-hidden="true"
      />
      {{ epicId ? $t("epics.modal.editEpic") : $t("epics.modal.newEpic") }}
    </h2>
    <button
      type="button"
      class="text-slate-400 hover:text-slate-700 transition"
      :aria-label="$t('epics.modal.close')"
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
  </header>
</template>
