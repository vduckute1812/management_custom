<script setup lang="ts">
import { UPLOAD_ACCEPT_IMAGES_ATTR } from "~/utils/uploadPolicy";

const props = defineProps<{
  busy?: boolean;
  recording?: boolean;
  sending?: boolean;
  uploadingMedia?: boolean;
}>();

const emit = defineEmits<{
  submit: [];
  imageSelected: [file: File];
}>();

const draft = defineModel<string>({ required: true });

const { t } = useI18n();

const inputEl = ref<HTMLTextAreaElement | null>(null);
const imageInput = ref<HTMLInputElement | null>(null);

function insertAtCursor(char: string) {
  const el = inputEl.value;
  if (el && typeof el.selectionStart === "number") {
    const start = el.selectionStart;
    const end = el.selectionEnd ?? start;
    const before = draft.value.slice(0, start);
    const after = draft.value.slice(end);
    draft.value = `${before}${char}${after}`;
    nextTick(() => {
      el.focus();
      const pos = start + char.length;
      el.setSelectionRange(pos, pos);
    });
  } else {
    draft.value += char;
    nextTick(() => inputEl.value?.focus());
  }
}

function openImagePicker() {
  if (props.busy || props.recording) return;
  imageInput.value?.click();
}

function onImageSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || props.busy) return;
  emit("imageSelected", file);
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    emit("submit");
  }
}

function focus() {
  inputEl.value?.focus();
}

defineExpose({ insertAtCursor, openImagePicker, focus });
</script>

<template>
  <form
    class="flex items-end gap-1.5 p-3 sm:gap-2"
    @submit.prevent="emit('submit')"
  >
    <slot name="toolbar" />

    <input
      ref="imageInput"
      type="file"
      class="hidden"
      :accept="UPLOAD_ACCEPT_IMAGES_ATTR"
      @change="onImageSelected"
    />

    <label class="sr-only" for="chat-composer">{{
      t("chat.composeLabel")
    }}</label>
    <textarea
      id="chat-composer"
      ref="inputEl"
      v-model="draft"
      rows="1"
      maxlength="4000"
      class="max-h-28 min-h-[2.5rem] flex-1 resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
      :placeholder="t('chat.composePlaceholder')"
      :disabled="busy || recording"
      @keydown="onKeydown"
    />

    <button
      type="submit"
      class="h-10 shrink-0 rounded-xl bg-brand-600 px-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50 sm:px-4"
      :disabled="!draft.trim() || busy || recording"
    >
      {{
        uploadingMedia
          ? t("chat.uploading")
          : sending
            ? t("chat.sending")
            : t("chat.send")
      }}
    </button>
  </form>
</template>
