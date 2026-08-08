<script setup lang="ts">
import type { PostCategory, UploadRecord } from "~/types/post";
import {
  POST_FONT_FAMILIES,
  POST_TEXT_COLORS,
  PostVisibility,
  type PostFontFamily,
  type PostTextColor,
} from "~/types/post";
import {
  CONTENT_LOCALE_LABELS,
  type ContentLocale,
} from "~/utils/contentLocale";
import { categoryDisplayName } from "~/utils/categoryLabel";

defineProps<{
  categories?: PostCategory[];
  editing?: boolean;
  translationGroupId?: string | null;
  availableLocales: ContentLocale[];
  attachments: UploadRecord[];
  uploading: boolean;
}>();

const emit = defineEmits<{
  (e: "insert-latex", block: boolean): void;
  (e: "image-files-selected", event: Event): void;
  (e: "files-selected", event: Event): void;
  (e: "remove-attachment", id: string): void;
}>();

const contentLocale = defineModel<ContentLocale>("contentLocale", {
  required: true,
});
const categoryId = defineModel<string>("categoryId", { required: true });
const visibility = defineModel<PostVisibility>("visibility", {
  required: true,
});
const fontFamily = defineModel<PostFontFamily>("fontFamily", {
  required: true,
});
const textColor = defineModel<PostTextColor>("textColor", {
  required: true,
});

const { t, te } = useI18n();

function catLabel(cat: PostCategory) {
  return categoryDisplayName(cat, t, te);
}

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
</script>

<template>
  <div class="manuscript-studio__panel">
    <h2 class="manuscript-studio__panel-title">
      {{ $t("manuscript.settings") }}
    </h2>

    <label class="manuscript-studio__field" for="ms-locale">
      <span>{{ $t("manuscript.contentLocale") }}</span>
      <select id="ms-locale" v-model="contentLocale" :disabled="editing">
        <option v-for="code in availableLocales" :key="code" :value="code">
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
        <option v-for="cat in categories || []" :key="cat.id" :value="cat.id">
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

    <ManuscriptStudioSettingsTools
      :attachments="attachments"
      :uploading="uploading"
      @insert-latex="emit('insert-latex', $event)"
      @image-files-selected="emit('image-files-selected', $event)"
      @files-selected="emit('files-selected', $event)"
      @remove-attachment="emit('remove-attachment', $event)"
    />
  </div>
</template>

<style scoped>
.manuscript-studio__locale-hint {
  margin: -0.35rem 0 0.65rem;
  font-size: 0.75rem;
  line-height: 1.4;
  color: #6b7c72;
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

.manuscript-studio__field select {
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

.manuscript-studio__field select:focus {
  border-color: var(--ms-accent);
  box-shadow: 0 0 0 3px rgba(63, 111, 90, 0.15);
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

html[data-theme="dark"] .manuscript-studio__panel {
  background: #171d1a;
}

html[data-theme="dark"] .manuscript-studio__field select {
  background: #101512;
  color: var(--ms-ink);
}
</style>
