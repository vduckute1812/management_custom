<script setup lang="ts">
import type { UploadRecord } from "~/types/post";

defineProps<{
  attachments: UploadRecord[];
}>();

const emit = defineEmits<{
  (e: "remove", id: string): void;
}>();
</script>

<template>
  <div v-if="attachments.length" class="flex flex-wrap gap-2">
    <div
      v-for="att in attachments"
      :key="att.id"
      class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700"
    >
      <span class="truncate max-w-[10rem]">{{ att.fileName }}</span>
      <button
        type="button"
        class="text-slate-400 hover:text-rose-600"
        :aria-label="
          $t('feed.composer.removeAttachment', { name: att.fileName })
        "
        @click="emit('remove', att.id)"
      >
        ×
      </button>
    </div>
  </div>
</template>
