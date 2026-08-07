<script setup lang="ts">
defineProps<{
  postId: string;
}>();

const emit = defineEmits<{
  (event: "close"): void;
  (event: "share", note: string): void;
}>();

const note = ref("");
const submitting = ref(false);

function submit() {
  if (submitting.value) return;
  submitting.value = true;
  try {
    emit("share", note.value.trim());
    note.value = "";
    emit("close");
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="space-y-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3">
    <label class="sr-only" :for="`share-${postId}`">
      {{ $t("feed.post.shareNote") }}
    </label>
    <input
      :id="`share-${postId}`"
      v-model="note"
      type="text"
      maxlength="5000"
      class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
      :placeholder="$t('feed.post.shareNotePlaceholder')"
      @keydown.enter.prevent="submit"
    />
    <div class="flex justify-end gap-2">
      <button
        type="button"
        class="rounded px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-100"
        @click="emit('close')"
      >
        {{ $t("feed.post.cancel") }}
      </button>
      <button
        type="button"
        class="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        :disabled="submitting"
        @click="submit"
      >
        {{ $t("feed.post.shareNow") }}
      </button>
    </div>
  </div>
</template>
