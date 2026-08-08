<script setup lang="ts">
import type { PostAttachment } from "~/types/post";
import { UploadKind } from "~/types/post";
import { bodyReferencesUpload } from "~/utils/markdownMedia";

const props = defineProps<{
  attachments: PostAttachment[];
  body: string;
}>();

const { mediaUrl } = useMediaUrl();

/** Gallery tiles skip images already rendered inline in the markdown body. */
const galleryAttachments = computed(() =>
  props.attachments.filter((attachment) => {
    if (attachment.kind !== UploadKind.Image) return true;
    return !bodyReferencesUpload(
      props.body,
      attachment.uploadId,
      attachment.url,
    );
  }),
);
</script>

<template>
  <div
    v-if="galleryAttachments.length"
    class="grid gap-2"
    :class="galleryAttachments.length > 1 ? 'sm:grid-cols-2' : ''"
  >
    <template v-for="attachment in galleryAttachments" :key="attachment.id">
      <a
        v-if="attachment.kind === UploadKind.Image"
        :href="mediaUrl(attachment.url)"
        target="_blank"
        rel="noopener"
        class="block overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
      >
        <img
          :src="mediaUrl(attachment.url)"
          :alt="attachment.fileName"
          width="640"
          height="360"
          loading="lazy"
          class="w-full max-h-96 object-cover bg-slate-100 transition duration-300 group-hover:scale-[1.01]"
          @error="($event.target as HTMLImageElement).style.display = 'none'"
        />
      </a>
      <a
        v-else
        :href="mediaUrl(attachment.url)"
        target="_blank"
        rel="noopener"
        class="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
      >
        <span class="text-lg" aria-hidden="true">📄</span>
        <span class="truncate font-medium">{{ attachment.fileName }}</span>
        <span class="text-[11px] text-slate-400 shrink-0">
          {{ Math.round(attachment.sizeBytes / 1024) }} KB
        </span>
      </a>
    </template>
  </div>
</template>
