<script setup lang="ts">
defineProps<{
  message: string;
  /** When set, shows a Retry button that emits `retry`. */
  retryLabel?: string;
}>();

const emit = defineEmits<{
  (e: "retry"): void;
}>();
</script>

<template>
  <div
    class="flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800"
    role="alert"
  >
    <p class="min-w-0 flex-1">
      {{ message }}
    </p>
    <button
      v-if="retryLabel"
      type="button"
      class="shrink-0 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200 transition hover:bg-rose-100"
      @click="emit('retry')"
    >
      {{ retryLabel }}
    </button>
  </div>
</template>
