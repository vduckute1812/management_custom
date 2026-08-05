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
  PostVisibility,
} from "~/types/post";
import { POST_BODY_MAX_MANUSCRIPT } from "~/utils/postBodyLimits";
import {
  UPLOAD_ACCEPT_ATTR,
  UPLOAD_ACCEPT_IMAGES_ATTR,
  UPLOAD_MAX_PER_POST,
} from "~/utils/uploadPolicy";
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
  audience: PostAuthor[];
  results: PostAuthor[];
  searching: boolean;
  bodyLength: number;
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
const audienceQuery = defineModel<string>("audienceQuery", { required: true });

const emit = defineEmits<{
  (e: "insert-latex", block: boolean): void;
  (e: "image-files-selected", event: Event): void;
  (e: "files-selected", event: Event): void;
  (e: "remove-attachment", id: string): void;
  (e: "remove-audience", id: string): void;
  (e: "pick-audience", user: PostAuthor): void;
}>();

const { t, te } = useI18n();
const imageInput = ref<HTMLInputElement | null>(null);
const attachmentInput = ref<HTMLInputElement | null>(null);

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
            uploading
              ? $t("feed.composer.uploading")
              : $t("feed.composer.attach")
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
            @click="emit('remove-audience', u.id)"
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
            @click="emit('pick-audience', u)"
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
          count: bodyLength,
          max: POST_BODY_MAX_MANUSCRIPT,
        })
      }}
    </p>
  </aside>
</template>

<style scoped>
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
