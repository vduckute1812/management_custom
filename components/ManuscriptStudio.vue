<script setup lang="ts">
import type {
  PostAuthor,
  PostCategory,
  PostFontFamily,
  PostTextColor,
  UploadRecord,
} from "~/types/post";
import { PostFormat, PostVisibility, UploadKind } from "~/types/post";
import { resolveUploadRule } from "~/utils/uploadPolicy";
import {
  markdownImageForUpload,
  stripMarkdownImagesForUpload,
} from "~/utils/markdownMedia";
import { CONTENT_LOCALES, type ContentLocale } from "~/utils/contentLocale";

const props = withDefaults(
  defineProps<{
    submitting?: boolean;
    categories?: PostCategory[];
    /** Prefill when editing an existing manuscript. */
    initial?: {
      title?: string | null;
      body?: string;
      visibility?: PostVisibility;
      audience?: PostAuthor[];
      attachments?: UploadRecord[];
      categoryId?: string | null;
      fontFamily?: PostFontFamily;
      textColor?: PostTextColor;
      contentLocale?: ContentLocale | null;
    };
    /** When true, chrome copy and CTA use “save” phrasing. */
    editing?: boolean;
    /** When adding a translation of an existing manuscript. */
    translationGroupId?: string | null;
    /** Locales already published in this group. */
    existingLocales?: string[];
    initialLocale?: ContentLocale | null;
  }>(),
  {
    categories: () => [],
    editing: false,
    initial: undefined,
    translationGroupId: null,
    existingLocales: () => [],
    initialLocale: null,
  },
);

const emit = defineEmits<{
  (
    e: "submit",
    payload: {
      format: PostFormat;
      title: string;
      body: string;
      visibility: PostVisibility;
      audienceUserIds: string[];
      attachmentIds: string[];
      categoryId: string | null;
      fontFamily: PostFontFamily;
      textColor: PostTextColor;
      contentLocale: ContentLocale;
      translationGroupId: string | null;
    },
  ): void;
  (e: "cancel"): void;
}>();

const { t, locale } = useI18n();
const { validateFile } = useUploads();
const { pushToast } = useToasts();

function defaultLocale(): ContentLocale {
  if (props.initial?.contentLocale) return props.initial.contentLocale;
  if (props.initialLocale) return props.initialLocale;
  if ((CONTENT_LOCALES as readonly string[]).includes(locale.value)) {
    return locale.value as ContentLocale;
  }
  return "vi";
}

const title = ref(props.initial?.title ?? "");
const body = ref(props.initial?.body ?? "");
const contentLocale = ref<ContentLocale>(defaultLocale());
const visibility = ref<PostVisibility>(
  props.initial?.visibility ?? PostVisibility.Friends,
);
const categoryId = ref(props.initial?.categoryId || "");
const fontFamily = ref<PostFontFamily>(props.initial?.fontFamily ?? "serif");
const textColor = ref<PostTextColor>(props.initial?.textColor ?? "default");
const paperRef = ref<{
  focus: () => void;
  insertAtCursor: (snippet: string) => void;
} | null>(null);

const {
  audience,
  audienceQuery,
  results,
  searching,
  pickAudience,
  removeAudience,
  clearAudience,
} = useAudiencePicker(visibility, props.initial?.audience);

const {
  attachments,
  uploading,
  uploadFiles,
  onFilesSelected,
  removeAttachment: removeAttachmentRecord,
  clearAttachments,
} = useComposerAttachments(props.initial?.attachments);

const availableLocales = computed(() =>
  CONTENT_LOCALES.filter(
    (code) =>
      code === contentLocale.value || !props.existingLocales.includes(code),
  ),
);

const canSubmit = computed(
  () =>
    title.value.trim().length > 0 &&
    body.value.trim().length > 0 &&
    !props.submitting &&
    !uploading.value &&
    (visibility.value !== PostVisibility.Shared || audience.value.length > 0),
);

function removeAttachment(id: string) {
  removeAttachmentRecord(id);
  body.value = stripMarkdownImagesForUpload(body.value, id);
}

function insertLatex(block = false) {
  paperRef.value?.insertAtCursor(block ? "$$\nE = mc^2\n$$" : "$E = mc^2$");
}

async function onImagesSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = "";
  if (!files.length) return;

  const accepted: File[] = [];
  for (const file of files) {
    const reason = validateFile(file);
    if (reason) pushToast(reason, { tone: "danger" });
    else if (
      resolveUploadRule(file.name, file.type)?.kind !== UploadKind.Image
    ) {
      pushToast(t("feed.composer.imageOnly"), { tone: "danger" });
    } else accepted.push(file);
  }
  if (!accepted.length) return;

  const uploaded = await uploadFiles(accepted);
  for (const record of uploaded) {
    paperRef.value?.insertAtCursor(markdownImageForUpload(record));
  }
}

function onSubmit() {
  if (!canSubmit.value) return;
  emit("submit", {
    format: PostFormat.Manuscript,
    title: title.value.trim(),
    body: body.value.trim(),
    visibility: visibility.value,
    audienceUserIds: audience.value.map((u) => u.id),
    attachmentIds: attachments.value.map((a) => a.id),
    categoryId: categoryId.value || null,
    fontFamily: fontFamily.value,
    textColor: textColor.value,
    contentLocale: contentLocale.value,
    translationGroupId: props.translationGroupId ?? null,
  });
}

function clear() {
  title.value = "";
  body.value = "";
  contentLocale.value = defaultLocale();
  visibility.value = PostVisibility.Friends;
  categoryId.value = "";
  fontFamily.value = "serif";
  textColor.value = "default";
  clearAudience();
  clearAttachments();
}

function focus() {
  paperRef.value?.focus();
}

defineExpose({ clear, focus });
</script>

<template>
  <form class="manuscript-studio" @submit.prevent="onSubmit">
    <ManuscriptStudioToolbar
      :editing="editing"
      :submitting="submitting"
      :can-submit="canSubmit"
      @cancel="emit('cancel')"
    />

    <div class="manuscript-studio__layout">
      <ManuscriptStudioPaper
        ref="paperRef"
        v-model:title="title"
        v-model:body="body"
        :submitting="submitting"
        :font-family="fontFamily"
        :text-color="textColor"
        @submit="onSubmit"
      />

      <ManuscriptStudioSettings
        v-model:content-locale="contentLocale"
        v-model:category-id="categoryId"
        v-model:visibility="visibility"
        v-model:font-family="fontFamily"
        v-model:text-color="textColor"
        v-model:audience-query="audienceQuery"
        :categories="categories"
        :editing="editing"
        :translation-group-id="translationGroupId"
        :available-locales="availableLocales"
        :attachments="attachments"
        :uploading="uploading"
        :audience="audience"
        :results="results"
        :searching="searching"
        :body-length="body.length"
        @insert-latex="insertLatex"
        @image-files-selected="onImagesSelected"
        @files-selected="onFilesSelected"
        @remove-attachment="removeAttachment"
        @remove-audience="removeAudience"
        @pick-audience="pickAudience"
      />
    </div>
  </form>
</template>

<style scoped>
.manuscript-studio {
  --ms-ink: #1a1f1c;
  --ms-muted: #66736b;
  --ms-paper: #f4f6f3;
  --ms-canvas: #e8ece7;
  --ms-rule: #d5ddd6;
  --ms-accent: #3f6f5a;
  --ms-accent-soft: #e4efe8;
  color: var(--ms-ink);
}

.manuscript-studio__layout {
  display: grid;
  gap: 1rem;
}

@media (min-width: 1024px) {
  .manuscript-studio__layout {
    grid-template-columns: minmax(0, 1fr) 260px;
    gap: 1.25rem;
    align-items: start;
  }
}

html[data-theme="dark"] .manuscript-studio {
  --ms-ink: #e8eee9;
  --ms-muted: #9aaba0;
  --ms-paper: #151a17;
  --ms-canvas: #0f1311;
  --ms-rule: #2a332e;
  --ms-accent: #86b49a;
  --ms-accent-soft: #24312a;
}
</style>
