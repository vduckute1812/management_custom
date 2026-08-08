<script setup lang="ts">
import type { PostFontFamily, PostTextColor } from "~/types/post";

const title = defineModel<string>("title", { required: true });
const body = defineModel<string>("body", { required: true });

defineProps<{
  submitting?: boolean;
  fontFamily: PostFontFamily;
  textColor: PostTextColor;
}>();

const emit = defineEmits<{
  (e: "submit"): void;
}>();

const editorRef = ref<{
  focus: () => void;
  insertAtCursor: (snippet: string) => void;
} | null>(null);

function insertAtCursor(snippet: string) {
  editorRef.value?.insertAtCursor(snippet);
}

function focus() {
  editorRef.value?.focus();
}

defineExpose({ focus, insertAtCursor });
</script>

<template>
  <section
    class="manuscript-studio__paper"
    :aria-label="$t('manuscript.canvasAria')"
  >
    <ManuscriptStudioEditor
      ref="editorRef"
      v-model:title="title"
      v-model:body="body"
      :submitting="submitting"
      :font-family="fontFamily"
      :text-color="textColor"
      @submit="emit('submit')"
    />
    <ManuscriptStudioFooter />
  </section>
</template>

<style scoped>
.manuscript-studio__paper {
  position: relative;
  overflow: hidden;
  border-radius: 1.25rem;
  border: 1px solid var(--ms-rule);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.55), transparent 28%),
    var(--ms-paper);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.7) inset,
    0 18px 40px rgba(26, 31, 28, 0.06);
  padding: 1.25rem 1.15rem 1.5rem;
  animation: manuscript-rise 420ms cubic-bezier(0.22, 1, 0.36, 1);
}

@media (min-width: 640px) {
  .manuscript-studio__paper {
    padding: 1.75rem 1.85rem 2rem;
  }
}

.manuscript-studio__paper::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  background: linear-gradient(180deg, var(--ms-accent), transparent 70%);
  opacity: 0.85;
}

@keyframes manuscript-rise {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

html[data-theme="dark"] .manuscript-studio__paper {
  background: #171d1a;
}
</style>
