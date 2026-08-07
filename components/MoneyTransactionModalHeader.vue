<script setup lang="ts">
defineProps<{
  transactionId?: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();
</script>

<template>
  <header
    class="flex items-center justify-between border-b border-slate-200 px-6 py-4"
  >
    <h2 id="money-modal-title" class="text-lg font-semibold text-slate-900">
      {{
        transactionId ? $t("money.modal.editTitle") : $t("money.modal.newTitle")
      }}
    </h2>
    <button
      type="button"
      class="text-slate-400 transition hover:text-slate-700"
      :aria-label="$t('money.modal.close')"
      @click="emit('close')"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        class="h-5 w-5"
      >
        <path d="M6 6l12 12M6 18L18 6" stroke-linecap="round" />
      </svg>
    </button>
  </header>
</template>
