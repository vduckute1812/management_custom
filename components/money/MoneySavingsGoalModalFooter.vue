<script setup lang="ts">
defineProps<{
  goalId?: string;
  submitting: boolean;
}>();

const emit = defineEmits<{
  (e: "cancel"): void;
  (e: "delete"): void;
  (e: "save"): void;
}>();
</script>

<template>
  <footer
    class="flex items-center justify-between gap-3 border-t border-slate-200 px-6 py-4"
  >
    <button
      v-if="goalId"
      type="button"
      class="text-xs font-semibold text-rose-600 hover:text-rose-700 disabled:opacity-50"
      :disabled="submitting"
      @click="emit('delete')"
    >
      {{ $t("money.savings.modal.delete") }}
    </button>
    <div v-else />
    <div class="flex items-center gap-2">
      <button
        type="button"
        class="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
        :disabled="submitting"
        @click="emit('cancel')"
      >
        {{ $t("money.savings.modal.cancel") }}
      </button>
      <button
        type="button"
        class="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
        :disabled="submitting"
        @click="emit('save')"
      >
        {{
          submitting
            ? $t("money.savings.modal.saving")
            : $t("money.savings.modal.save")
        }}
      </button>
    </div>
  </footer>
</template>
