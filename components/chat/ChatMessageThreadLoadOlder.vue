<script setup lang="ts">
defineProps<{
  hasMore?: boolean;
  loadingMore?: boolean;
}>();

const emit = defineEmits<{
  loadMore: [];
}>();

const { t } = useI18n();
</script>

<template>
  <div class="mb-2 flex min-h-8 items-center justify-center">
    <span
      v-if="loadingMore"
      class="text-xs font-medium text-slate-400"
      aria-live="polite"
    >
      {{ t("chat.loadingOlder") }}
    </span>
    <button
      v-else-if="hasMore"
      type="button"
      class="rounded-lg px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
      @click="emit('loadMore')"
    >
      {{ t("chat.loadOlder") }}
    </button>
  </div>
</template>
