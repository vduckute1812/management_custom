<script setup lang="ts">
import type { PostFontFamily, PostTextColor } from "~/types/post";
import {
  POST_BODY_MAX_MANUSCRIPT,
  POST_TITLE_MAX,
} from "~/utils/postBodyLimits";
import { estimateReadingMinutes } from "~/utils/manuscript";

const title = defineModel<string>("title", { required: true });
const body = defineModel<string>("body", { required: true });

const props = defineProps<{
  submitting?: boolean;
  fontFamily: PostFontFamily;
  textColor: PostTextColor;
}>();

const emit = defineEmits<{
  (e: "submit"): void;
}>();

const titleEl = ref<HTMLInputElement | null>(null);
const bodyEl = ref<HTMLTextAreaElement | null>(null);

const readingMinutes = computed(() =>
  estimateReadingMinutes(body.value, title.value),
);

const wordCount = computed(() => {
  const text = `${title.value} ${body.value}`.trim();
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
});

const bodyStyle = computed(() => ({
  fontFamily:
    props.fontFamily === "default"
      ? undefined
      : props.fontFamily === "mono"
        ? "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
        : props.fontFamily === "serif" || props.fontFamily === "georgia"
          ? '"Source Serif 4", "Libertinus Serif", Georgia, "Times New Roman", serif'
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

function insertAtCursor(snippet: string) {
  const el = bodyEl.value;
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

function focus() {
  (titleEl.value || bodyEl.value)?.focus();
}

function focusTitle() {
  titleEl.value?.focus();
}

defineExpose({ focus, focusTitle, insertAtCursor });

onMounted(() => {
  nextTick(() => titleEl.value?.focus());
});
</script>

<template>
  <label class="sr-only" for="manuscript-title">{{
    $t("manuscript.titleLabel")
  }}</label>
  <input
    id="manuscript-title"
    ref="titleEl"
    v-model="title"
    type="text"
    :maxlength="POST_TITLE_MAX"
    class="manuscript-studio__title"
    :placeholder="$t('manuscript.titlePlaceholder')"
    :disabled="submitting"
    autocomplete="off"
  />

  <ManuscriptStudioMeta
    :reading-minutes="readingMinutes"
    :word-count="wordCount"
  />

  <label class="sr-only" for="manuscript-body">{{
    $t("manuscript.bodyLabel")
  }}</label>
  <textarea
    id="manuscript-body"
    ref="bodyEl"
    v-model="body"
    rows="28"
    :maxlength="POST_BODY_MAX_MANUSCRIPT"
    class="manuscript-studio__body"
    :placeholder="$t('manuscript.bodyPlaceholder')"
    :disabled="submitting"
    :style="bodyStyle"
    @keydown.meta.enter.prevent="emit('submit')"
    @keydown.ctrl.enter.prevent="emit('submit')"
  />
</template>

<style scoped>
.manuscript-studio__title {
  width: 100%;
  border: 0;
  background: transparent;
  font-family: "Source Serif 4", Georgia, "Times New Roman", serif;
  font-size: clamp(1.55rem, 3vw, 2.35rem);
  font-weight: 600;
  letter-spacing: -0.025em;
  line-height: 1.2;
  color: var(--ms-ink);
  outline: none;
}

.manuscript-studio__title::placeholder {
  color: #9aa89f;
}

.manuscript-studio__body {
  width: 100%;
  min-height: 68vh;
  resize: vertical;
  border: 0;
  background: transparent;
  font-family: "Source Serif 4", Georgia, "Times New Roman", serif;
  font-size: 1.05rem;
  line-height: 1.85;
  color: var(--ms-ink);
  outline: none;
}

.manuscript-studio__body::placeholder {
  color: #9aa89f;
}
</style>
