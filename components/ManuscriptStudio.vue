<script setup lang="ts">
import type {
  PostAuthor,
  PostCategory,
  PostFontFamily,
  PostTextColor,
  UploadRecord,
} from "~/types/post";
import {
  POST_FONT_FAMILIES,
  POST_TEXT_COLORS,
  PostFormat,
  PostVisibility,
  UploadKind,
} from "~/types/post";
import {
  POST_BODY_MAX_MANUSCRIPT,
  POST_TITLE_MAX,
} from "~/utils/postBodyLimits";
import { estimateReadingMinutes } from "~/utils/manuscript";
import {
  UPLOAD_ACCEPT_ATTR,
  UPLOAD_ACCEPT_IMAGES_ATTR,
  UPLOAD_MAX_PER_POST,
  resolveUploadRule,
} from "~/utils/uploadPolicy";
import { categoryDisplayName } from "~/utils/categoryLabel";
import {
  markdownImageForUpload,
  stripMarkdownImagesForUpload,
} from "~/utils/markdownMedia";
import {
  CONTENT_LOCALES,
  CONTENT_LOCALE_LABELS,
  type ContentLocale,
} from "~/utils/contentLocale";

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

const { t, te, locale } = useI18n();
const auth = useAuth();
const { validateFile } = useUploads();
const { pushToast } = useToasts();

function catLabel(cat: PostCategory) {
  return categoryDisplayName(cat, t, te);
}

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
const imageInput = ref<HTMLInputElement | null>(null);
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
  fileInput,
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

const visibilityOptions = computed(() => [
  { value: PostVisibility.Friends, label: t("feed.composer.friends") },
  { value: PostVisibility.Public, label: t("feed.composer.public") },
  { value: PostVisibility.Private, label: t("feed.composer.onlyMe") },
  { value: PostVisibility.Shared, label: t("feed.composer.specificPeople") },
]);

const fontLabels = computed<Record<PostFontFamily, string>>(() => ({
  default: t("feed.composer.fontDefault"),
  serif: t("feed.composer.fontSerif"),
  mono: t("feed.composer.fontMono"),
  georgia: t("feed.composer.fontGeorgia"),
  comic: t("feed.composer.fontComic"),
}));

const colorLabels = computed<Record<PostTextColor, string>>(() => ({
  default: t("feed.composer.colorDefault"),
  slate: t("feed.composer.colorSlate"),
  brand: t("feed.composer.colorBlue"),
  rose: t("feed.composer.colorRose"),
  emerald: t("feed.composer.colorGreen"),
  amber: t("feed.composer.colorAmber"),
}));

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

      <aside
        class="manuscript-studio__rail"
        :aria-label="$t('manuscript.settingsAria')"
      >
        <div class="manuscript-studio__panel">
          <h2 class="manuscript-studio__panel-title">
            {{ $t("manuscript.settings") }}
          </h2>

          <label class="manuscript-studio__field" for="ms-locale">
            <span>{{ $t("manuscript.contentLocale") }}</span>
            <select id="ms-locale" v-model="contentLocale" :disabled="editing">
              <option
                v-for="code in availableLocales"
                :key="code"
                :value="code"
              >
                {{ CONTENT_LOCALE_LABELS[code] }} —
                {{ $t(`manuscript.localeNames.${code}`) }}
              </option>
            </select>
          </label>
          <p v-if="translationGroupId" class="manuscript-studio__locale-hint">
            {{ $t("manuscript.addingTranslation") }}
          </p>

          <label class="manuscript-studio__field" for="ms-category">
            <span>{{ $t("feed.composer.category") }}</span>
            <select id="ms-category" v-model="categoryId">
              <option value="">{{ $t("feed.composer.noCategory") }}</option>
              <option
                v-for="cat in categories || []"
                :key="cat.id"
                :value="cat.id"
              >
                {{ catLabel(cat) }}
              </option>
            </select>
          </label>

          <label class="manuscript-studio__field" for="ms-visibility">
            <span>{{ $t("feed.composer.visibility") }}</span>
            <select id="ms-visibility" v-model.number="visibility">
              <option
                v-for="opt in visibilityOptions"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </option>
            </select>
          </label>

          <label class="manuscript-studio__field" for="ms-font">
            <span>{{ $t("feed.composer.font") }}</span>
            <select id="ms-font" v-model="fontFamily">
              <option v-for="f in POST_FONT_FAMILIES" :key="f" :value="f">
                {{ fontLabels[f] }}
              </option>
            </select>
          </label>

          <label class="manuscript-studio__field" for="ms-color">
            <span>{{ $t("feed.composer.textColor") }}</span>
            <select id="ms-color" v-model="textColor">
              <option v-for="c in POST_TEXT_COLORS" :key="c" :value="c">
                {{ colorLabels[c] }}
              </option>
            </select>
          </label>

          <div class="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              class="manuscript-studio__chip"
              @click="insertLatex(false)"
            >
              {{ $t("feed.composer.latexInline") }}
            </button>
            <button
              type="button"
              class="manuscript-studio__chip"
              @click="insertLatex(true)"
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
              @change="onImagesSelected"
            />
            <button
              type="button"
              class="manuscript-studio__chip"
              :disabled="uploading || attachments.length >= UPLOAD_MAX_PER_POST"
              @click="fileInput?.click()"
            >
              {{
                uploading
                  ? $t("feed.composer.uploading")
                  : $t("feed.composer.attach")
              }}
            </button>
            <input
              ref="fileInput"
              type="file"
              class="hidden"
              multiple
              :accept="UPLOAD_ACCEPT_ATTR"
              @change="onFilesSelected"
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
                @click="removeAttachment(att.id)"
              >
                ×
              </button>
            </div>
          </div>
        </div>

        <div
          v-if="visibility === PostVisibility.Shared"
          class="manuscript-studio__panel space-y-2"
        >
          <label class="block text-xs font-medium" for="ms-audience">
            {{ $t("feed.composer.shareWith") }}
          </label>
          <div v-if="audience.length" class="flex flex-wrap gap-1.5">
            <span
              v-for="u in audience"
              :key="u.id"
              class="inline-flex items-center gap-1 rounded-full bg-[color:var(--ms-accent-soft)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--ms-accent)]"
            >
              {{ u.name || u.email }}
              <button
                type="button"
                class="hover:text-rose-600"
                :aria-label="
                  $t('feed.composer.removePerson', { name: u.name || u.email })
                "
                @click="removeAudience(u.id)"
              >
                ×
              </button>
            </span>
          </div>
          <input
            id="ms-audience"
            v-model="audienceQuery"
            type="search"
            autocomplete="off"
            class="manuscript-studio__input"
            :placeholder="$t('feed.composer.searchPeople')"
          />
          <ul
            v-if="audienceQuery.trim() && (searching || results.length)"
            class="max-h-40 overflow-auto rounded-lg border border-[color:var(--ms-rule)] bg-white divide-y divide-[color:var(--ms-rule)]"
            role="listbox"
          >
            <li v-if="searching" class="px-3 py-2 text-xs text-slate-400">
              {{ $t("feed.composer.searching") }}
            </li>
            <li
              v-for="u in results.filter(
                (r) => !audience.some((a) => a.id === r.id),
              )"
              :key="u.id"
            >
              <button
                type="button"
                class="w-full px-3 py-2 text-left text-sm hover:bg-[color:var(--ms-paper)]"
                role="option"
                @click="pickAudience(u)"
              >
                <span class="font-medium">{{ u.name || u.email }}</span>
                <span v-if="u.name" class="block text-[11px] text-slate-500">{{
                  u.email
                }}</span>
              </button>
            </li>
          </ul>
        </div>

        <p class="text-[11px] tabular-nums text-[color:var(--ms-muted)]">
          {{
            $t("manuscript.charCount", {
              count: body.length,
              max: POST_BODY_MAX_MANUSCRIPT,
            })
          }}
        </p>
      </aside>
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

.manuscript-studio__locale-hint {
  margin: -0.35rem 0 0.65rem;
  font-size: 0.75rem;
  line-height: 1.4;
  color: #6b7c72;
}

.manuscript-studio__rail {
  display: grid;
  gap: 0.85rem;
}

.manuscript-studio__panel {
  border-radius: 1rem;
  border: 1px solid var(--ms-rule);
  background: rgba(255, 255, 255, 0.72);
  padding: 0.95rem;
  backdrop-filter: blur(6px);
  animation: manuscript-rise 520ms cubic-bezier(0.22, 1, 0.36, 1);
}

.manuscript-studio__panel-title {
  margin-bottom: 0.75rem;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ms-muted);
}

.manuscript-studio__field {
  display: grid;
  gap: 0.35rem;
  margin-bottom: 0.7rem;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--ms-muted);
}

.manuscript-studio__field select,
.manuscript-studio__input {
  width: 100%;
  border-radius: 0.65rem;
  border: 1px solid var(--ms-rule);
  background: #fff;
  padding: 0.55rem 0.7rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--ms-ink);
  outline: none;
}

.manuscript-studio__field select:focus,
.manuscript-studio__input:focus {
  border-color: var(--ms-accent);
  box-shadow: 0 0 0 3px rgba(63, 111, 90, 0.15);
}

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

html[data-theme="dark"] .manuscript-studio__paper,
html[data-theme="dark"] .manuscript-studio__panel {
  background: #171d1a;
}

html[data-theme="dark"] .manuscript-studio__field select,
html[data-theme="dark"] .manuscript-studio__input,
html[data-theme="dark"] .manuscript-studio__chip {
  background: #101512;
  color: var(--ms-ink);
}
</style>
