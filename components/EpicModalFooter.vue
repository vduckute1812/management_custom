<script setup lang="ts">
defineProps<{
  epicId?: string;
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
      v-if="epicId"
      type="button"
      :disabled="submitting"
      class="text-sm font-medium text-rose-600 hover:text-rose-700 disabled:opacity-50"
      @click="emit('delete')"
    >
      {{ $t("epics.modal.deleteEpic") }}
    </button>
    <span v-else />
    <div class="flex items-center gap-2">
      <button
        type="button"
        class="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 rounded-lg transition"
        @click="emit('cancel')"
      >
        {{ $t("epics.modal.cancel") }}
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
            ? $t("epics.modal.saved")
            : submitting
              ? $t("epics.modal.saving")
              : epicId
                ? $t("epics.modal.saveChanges")
                : $t("epics.modal.createEpic")
        }}
      </button>
    </div>
  </footer>
</template>
