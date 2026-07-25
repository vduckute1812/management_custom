<script setup lang="ts">
const props = defineProps<{
  submitting?: boolean;
  placeholder?: string;
  submitLabel?: string;
}>();

const emit = defineEmits<{
  (e: "submit", body: string): void;
}>();

const body = ref("");
const textareaEl = ref<HTMLTextAreaElement | null>(null);

const canSubmit = computed(
  () => body.value.trim().length > 0 && !props.submitting
);

function onSubmit() {
  if (!canSubmit.value) return;
  emit("submit", body.value.trim());
}

function clear() {
  body.value = "";
}

function focus() {
  textareaEl.value?.focus();
}

defineExpose({ clear, focus });
</script>

<template>
  <form
    class="rounded-xl border border-slate-200 bg-white p-4 space-y-3"
    @submit.prevent="onSubmit"
  >
    <label class="sr-only" for="post-composer">Write a post</label>
    <textarea
      id="post-composer"
      ref="textareaEl"
      v-model="body"
      rows="3"
      maxlength="5000"
      class="w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-300"
      :placeholder="placeholder || 'What do you want to share?'"
      :disabled="submitting"
      @keydown.meta.enter.prevent="onSubmit"
      @keydown.ctrl.enter.prevent="onSubmit"
    />
    <div class="flex items-center justify-between gap-3">
      <p class="text-[11px] text-slate-400 tabular-nums">
        {{ body.length }}/5000 · ⌘/Ctrl+Enter to post
      </p>
      <button
        type="submit"
        class="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 disabled:pointer-events-none transition"
        :disabled="!canSubmit"
      >
        <svg
          v-if="submitting"
          class="w-3.5 h-3.5 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle
            cx="12"
            cy="12"
            r="9"
            stroke="currentColor"
            stroke-width="2"
            class="opacity-25"
          />
          <path
            d="M21 12a9 9 0 00-9-9"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          />
        </svg>
        {{ submitLabel || "Post" }}
      </button>
    </div>
  </form>
</template>
