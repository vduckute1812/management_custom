<script setup lang="ts">
import type { UploadRecord } from "~/types/post";
import {
  UPLOAD_ACCEPT_ATTR,
  UPLOAD_ACCEPT_IMAGES_ATTR,
  UPLOAD_MAX_PER_POST,
} from "~/utils/uploadPolicy";

defineProps<{
  attachments: UploadRecord[];
  uploading: boolean;
}>();

const emit = defineEmits<{
  (e: "insert-latex", block: boolean): void;
  (e: "image-files-selected", event: Event): void;
  (e: "files-selected", event: Event): void;
  (e: "remove-attachment", id: string): void;
}>();

const imageInput = ref<HTMLInputElement | null>(null);
const attachmentInput = ref<HTMLInputElement | null>(null);
</script>

<template>
  <div class="manuscript-studio__tools">
    <div class="flex flex-wrap gap-2 pt-1">
      <button
        type="button"
        class="manuscript-studio__chip"
        @click="emit('insert-latex', false)"
      >
        {{ $t("feed.composer.latexInline") }}
      </button>
      <button
        type="button"
        class="manuscript-studio__chip"
        @click="emit('insert-latex', true)"
      >
        {{ $t("feed.composer.latexBlock") }}
      </button>
      <button
        type="button"
        class="manuscript-studio__chip"
        :disabled="uploading || attachments.length >= UPLOAD_MAX_PER_POST"
        :title="$t('feed.composer.insertImage')"
        @click="imageInput?.click()"
      >
        {{
          uploading
            ? $t("feed.composer.uploading")
            : $t("feed.composer.insertImageShort")
        }}
      </button>
      <input
        ref="imageInput"
        type="file"
        class="hidden"
        multiple
        :accept="UPLOAD_ACCEPT_IMAGES_ATTR"
        @change="emit('image-files-selected', $event)"
      />
      <button
        type="button"
        class="manuscript-studio__chip"
        :disabled="uploading || attachments.length >= UPLOAD_MAX_PER_POST"
        @click="attachmentInput?.click()"
      >
        {{
          uploading ? $t("feed.composer.uploading") : $t("feed.composer.attach")
        }}
      </button>
      <input
        ref="attachmentInput"
        type="file"
        class="hidden"
        multiple
        :accept="UPLOAD_ACCEPT_ATTR"
        @change="emit('files-selected', $event)"
      />
    </div>

    <div v-if="attachments.length" class="flex flex-wrap gap-2 pt-2">
      <div
        v-for="att in attachments"
        :key="att.id"
        class="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--ms-rule)] bg-white/70 px-2 py-1 text-xs text-[color:var(--ms-ink)]"
      >
        <span class="max-w-[10rem] truncate">{{ att.fileName }}</span>
        <button
          type="button"
          class="text-slate-400 hover:text-rose-600"
          :aria-label="
            $t('feed.composer.removeAttachment', { name: att.fileName })
          "
          @click="emit('remove-attachment', att.id)"
        >
          ×
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.manuscript-studio__chip {
  border-radius: 0.6rem;
  border: 1px solid var(--ms-rule);
  background: #fff;
  padding: 0.4rem 0.65rem;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--ms-ink);
}

.manuscript-studio__chip:hover:not(:disabled) {
  border-color: var(--ms-accent);
  color: var(--ms-accent);
}

.manuscript-studio__chip:disabled {
  opacity: 0.5;
}

html[data-theme="dark"] .manuscript-studio__chip {
  background: #101512;
  color: var(--ms-ink);
}
</style>
