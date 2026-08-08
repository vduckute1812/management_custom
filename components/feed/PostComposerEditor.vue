<script setup lang="ts">
import type { PostFontFamily, PostTextColor } from "~/types/post";
import { POST_BODY_MAX_UPDATE } from "~/utils/postBodyLimits";

const props = defineProps<{
  placeholder?: string;
  submitting?: boolean;
  fontFamily: PostFontFamily;
  textColor: PostTextColor;
}>();

const emit = defineEmits<{
  (e: "submit"): void;
}>();

const body = defineModel<string>({ required: true });

const textareaEl = ref<HTMLTextAreaElement | null>(null);

const editorStyle = computed(() => ({
  fontFamily:
    props.fontFamily === "default"
      ? undefined
      : props.fontFamily === "mono"
        ? "ui-monospace, monospace"
        : props.fontFamily === "serif" || props.fontFamily === "georgia"
          ? "Georgia, serif"
          : props.fontFamily === "comic"
            ? "Comic Sans MS, cursive"
            : undefined,
  color:
    props.textColor === "default"
      ? undefined
      : props.textColor === "slate"
        ? "#334155"
        : props.textColor === "brand"
          ? "#1d4ed8"
          : props.textColor === "rose"
            ? "#e11d48"
            : props.textColor === "emerald"
              ? "#059669"
              : props.textColor === "amber"
                ? "#d97706"
                : undefined,
}));

function focus() {
  textareaEl.value?.focus();
}

function insertAtCursor(snippet: string) {
  const el = textareaEl.value;
  if (!el) {
    body.value += snippet;
    return;
  }
  const start = el.selectionStart ?? body.value.length;
  const end = el.selectionEnd ?? start;
  const before = body.value.slice(0, start);
  const after = body.value.slice(end);
  const padBefore = before.length === 0 || before.endsWith("\n") ? "" : "\n";
  const padAfter = after.startsWith("\n") ? "" : "\n";
  const text = `${padBefore}${snippet}${padAfter}`;
  body.value = before + text + after;
  nextTick(() => {
    const pos = start + text.length;
    el.focus();
    el.setSelectionRange(pos, pos);
  });
}

defineExpose({ focus, insertAtCursor, textareaEl });
</script>

<template>
  <div>
    <label class="sr-only" for="post-composer">{{
      $t("feed.composer.writeAPost")
    }}</label>
    <textarea
      id="post-composer"
      ref="textareaEl"
      v-model="body"
      rows="4"
      :maxlength="POST_BODY_MAX_UPDATE"
      class="min-h-[6.5rem] w-full resize-y rounded-xl border-0 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-900 ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
      :placeholder="placeholder || $t('feed.composer.placeholder')"
      :disabled="submitting"
      :style="editorStyle"
      @keydown.meta.enter.prevent="emit('submit')"
      @keydown.ctrl.enter.prevent="emit('submit')"
    />
    <p class="text-xs leading-5 text-slate-500">
      {{ $t("feed.composer.formatHint") }}
    </p>
  </div>
</template>
