<script setup lang="ts">
defineProps<{
  budgetId?: string;
  submitting: boolean;
}>();

const emit = defineEmits<{
  (e: "cancel"): void;
  (e: "delete"): void;
  (e: "save"): void;
}>();
</script>

<template>
  <div
    class="flex items-center justify-between gap-2 border-t border-slate-200 px-6 py-4"
  >
    <button
      v-if="budgetId"
      type="button"
      class="text-xs font-semibold text-rose-600 hover:text-rose-700"
      :disabled="submitting"
      @click="emit('delete')"
    >
      {{ $t("money.budgets.modal.delete") }}
    </button>
    <div v-else />
    <div class="flex gap-2">
      <button
        type="button"
        class="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
        @click="emit('cancel')"
      >
        {{ $t("money.budgets.modal.cancel") }}
      </button>
      <button
        type="button"
        class="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        :disabled="submitting"
        @click="emit('save')"
      >
        {{
          submitting
            ? $t("money.budgets.modal.saving")
            : $t("money.budgets.modal.save")
        }}
      </button>
    </div>
  </div>
</template>
