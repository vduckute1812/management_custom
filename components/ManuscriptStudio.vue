<script setup lang="ts">
import type {
  PostAuthor,
  PostCategory,
  PostFontFamily,
  PostTextColor,
  UploadRecord,
} from "~/types/post";
import { PostFormat, PostVisibility, UploadKind } from "~/types/post";
import {
  POST_BODY_MAX_MANUSCRIPT,
  POST_TITLE_MAX,
} from "~/utils/postBodyLimits";
import { estimateReadingMinutes } from "~/utils/manuscript";
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
    editing: false,
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
const auth = useAuth();
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
const titleEl = ref<HTMLInputElement | null>(null);
const bodyEl = ref<HTMLTextAreaElement | null>(null);

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

const readingMinutes = computed(() =>
  estimateReadingMinutes(body.value, title.value),
);

const wordCount = computed(() => {
  const text = `${title.value} ${body.value}`.trim();
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
});

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

function insertLatex(block = false) {
  insertAtCursor(block ? "$$\nE = mc^2\n$$" : "$E = mc^2$");
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
    insertAtCursor(markdownImageForUpload(record));
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
  (titleEl.value || bodyEl.value)?.focus();
}

defineExpose({ clear, focus });

onMounted(() => {
  nextTick(() => titleEl.value?.focus());
});

const bodyStyle = computed(() => ({
  fontFamily:
    fontFamily.value === "default"
      ? undefined
      : fontFamily.value === "mono"
        ? "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
        : fontFamily.value === "serif" || fontFamily.value === "georgia"
          ? '"Source Serif 4", "Libertinus Serif", Georgia, "Times New Roman", serif'
          : fontFamily.value === "comic"
            ? "Comic Sans MS, cursive"
            : undefined,
  color:
    textColor.value === "default"
      ? undefined
      : textColor.value === "slate"
        ? "#334155"
        : textColor.value === "brand"
          ? "#1d4ed8"
          : textColor.value === "rose"
            ? "#e11d48"
            : textColor.value === "emerald"
              ? "#059669"
              : textColor.value === "amber"
                ? "#d97706"
                : undefined,
}));
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
      <section
        class="manuscript-studio__paper"
        :aria-label="$t('manuscript.canvasAria')"
      >
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

        <div class="manuscript-studio__meta-line">
          <span>{{
            auth.user.value?.name || auth.user.value?.email || $t("nav.account")
          }}</span>
          <span aria-hidden="true">·</span>
          <span>{{
            $t("manuscript.readingTime", { count: readingMinutes })
          }}</span>
          <span aria-hidden="true">·</span>
          <span>{{ $t("manuscript.wordCount", { count: wordCount }) }}</span>
        </div>

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
          @keydown.meta.enter.prevent="onSubmit"
          @keydown.ctrl.enter.prevent="onSubmit"
        />
        <p class="manuscript-studio__format-hint">
          {{ $t("manuscript.formatHint") }}
        </p>
      </section>

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

.manuscript-studio__meta-line {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin: 0.85rem 0 1.15rem;
  font-size: 0.75rem;
  color: var(--ms-muted);
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

.manuscript-studio__format-hint {
  margin: 0.65rem 0 0;
  font-family: "Source Sans 3", system-ui, sans-serif;
  font-size: 0.78rem;
  line-height: 1.45;
  color: #6b7c72;
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

html[data-theme="dark"] .manuscript-studio {
  --ms-ink: #e8eee9;
  --ms-muted: #9aaba0;
  --ms-paper: #151a17;
  --ms-canvas: #0f1311;
  --ms-rule: #2a332e;
  --ms-accent: #86b49a;
  --ms-accent-soft: #24312a;
}

html[data-theme="dark"] .manuscript-studio__paper {
  background: #171d1a;
}
</style>
