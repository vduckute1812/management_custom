<script setup lang="ts">
import type {
  PostAuthor,
  PostCategory,
  PostFontFamily,
  PostTextColor,
  PostVisibility,
  UploadRecord,
} from "~/types/post";
import { POST_FONT_FAMILIES, POST_TEXT_COLORS } from "~/types/post";
import { UPLOAD_ACCEPT_ATTR, UPLOAD_MAX_PER_POST } from "~/utils/uploadPolicy";
import { categoryDisplayName } from "~/utils/categoryLabel";

const props = defineProps<{
  submitting?: boolean;
  placeholder?: string;
  submitLabel?: string;
  categories?: PostCategory[];
}>();

const emit = defineEmits<{
  (
    e: "submit",
    payload: {
      body: string;
      visibility: PostVisibility;
      audienceUserIds: string[];
      attachmentIds: string[];
      categoryId: string | null;
      fontFamily: PostFontFamily;
      textColor: PostTextColor;
    },
  ): void;
}>();

const { t, te } = useI18n();
const auth = useAuth();
const { uploadFile, validateFile } = useUploads();
const { pushToast } = useToasts();
const { results, loading: searching, searchDebounced } = useUserDirectory();

function catLabel(cat: PostCategory) {
  return categoryDisplayName(cat, t, te);
}

const body = ref("");
const visibility = ref<PostVisibility>("public");
const categoryId = ref("");
const fontFamily = ref<PostFontFamily>("default");
const textColor = ref<PostTextColor>("default");
const audience = ref<PostAuthor[]>([]);
const audienceQuery = ref("");
const attachments = ref<UploadRecord[]>([]);
const uploading = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const textareaEl = ref<HTMLTextAreaElement | null>(null);

const userInitial = computed(() => {
  const source = auth.user.value?.name || auth.user.value?.email || "";
  return source.charAt(0).toUpperCase() || "?";
});

const userLabel = computed(
  () => auth.user.value?.name || auth.user.value?.email || t("nav.account"),
);

const canSubmit = computed(
  () =>
    body.value.trim().length > 0 &&
    !props.submitting &&
    !uploading.value &&
    (visibility.value !== "shared" || audience.value.length > 0),
);

watch(audienceQuery, (q) => {
  if (visibility.value === "shared") searchDebounced(q);
});

function pickAudience(user: PostAuthor) {
  if (audience.value.some((u) => u.id === user.id)) return;
  audience.value = [...audience.value, user];
  audienceQuery.value = "";
}

function removeAudience(id: string) {
  audience.value = audience.value.filter((u) => u.id !== id);
}

async function onFilesSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = "";
  if (!files.length) return;

  // Report every rejected file, then upload the rest — one oversized pick
  // shouldn't discard the others in the same selection.
  const accepted: File[] = [];
  for (const file of files) {
    const reason = validateFile(file);
    if (reason) pushToast(reason, { tone: "danger" });
    else accepted.push(file);
  }
  if (!accepted.length) return;

  const room = Math.max(UPLOAD_MAX_PER_POST - attachments.value.length, 0);
  if (accepted.length > room) {
    pushToast(t("uploads.errors.tooMany", { max: UPLOAD_MAX_PER_POST }), {
      tone: "danger",
    });
  }

  uploading.value = true;
  try {
    for (const file of accepted.slice(0, room)) {
      const uploaded = await uploadFile(file);
      attachments.value = [...attachments.value, uploaded];
    }
  } catch {
    // uploadFile already surfaced a toast.
  } finally {
    uploading.value = false;
  }
}

function removeAttachment(id: string) {
  attachments.value = attachments.value.filter((a) => a.id !== id);
}

function insertLatex(block = false) {
  const el = textareaEl.value;
  const snippet = block ? "$$\nE = mc^2\n$$" : "$E = mc^2$";
  if (!el) {
    body.value += snippet;
    return;
  }
  const start = el.selectionStart ?? body.value.length;
  const end = el.selectionEnd ?? start;
  body.value = body.value.slice(0, start) + snippet + body.value.slice(end);
  nextTick(() => {
    const pos = start + snippet.length;
    el.focus();
    el.setSelectionRange(pos, pos);
  });
}

function onSubmit() {
  if (!canSubmit.value) return;
  emit("submit", {
    body: body.value.trim(),
    visibility: visibility.value,
    audienceUserIds: audience.value.map((u) => u.id),
    attachmentIds: attachments.value.map((a) => a.id),
    categoryId: categoryId.value || null,
    fontFamily: fontFamily.value,
    textColor: textColor.value,
  });
}

function clear() {
  body.value = "";
  visibility.value = "public";
  categoryId.value = "";
  fontFamily.value = "default";
  textColor.value = "default";
  audience.value = [];
  audienceQuery.value = "";
  attachments.value = [];
}

function focus() {
  textareaEl.value?.focus();
}

defineExpose({ clear, focus });

const visibilityLabel = computed<Record<PostVisibility, string>>(() => ({
  public: t("feed.composer.public"),
  private: t("feed.composer.onlyMe"),
  shared: t("feed.composer.specificPeople"),
}));

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
  <form
    class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow focus-within:shadow-md"
    @submit.prevent="onSubmit"
  >
    <div
      class="flex items-center gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-5"
    >
      <span
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-bold text-white shadow-sm ring-4 ring-brand-50"
        aria-hidden="true"
      >
        {{ userInitial }}
      </span>
      <div class="min-w-0">
        <p class="truncate text-sm font-semibold text-slate-900">
          {{ userLabel }}
        </p>
        <p class="text-[11px] text-slate-400">
          {{ visibilityLabel[visibility] }}
        </p>
      </div>
      <span
        class="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700"
      >
        <span
          class="h-1.5 w-1.5 rounded-full bg-emerald-500"
          aria-hidden="true"
        />
        {{ visibilityLabel[visibility] }}
      </span>
    </div>

    <div class="space-y-3 p-4 sm:p-5">
      <label class="sr-only" for="post-composer">{{
        $t("feed.composer.writeAPost")
      }}</label>
      <textarea
        id="post-composer"
        ref="textareaEl"
        v-model="body"
        rows="4"
        maxlength="5000"
        class="w-full resize-y rounded-xl border-0 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-900 ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
        :placeholder="placeholder || $t('feed.composer.placeholder')"
        :disabled="submitting"
        :style="{
          fontFamily:
            fontFamily === 'default'
              ? undefined
              : fontFamily === 'mono'
                ? 'ui-monospace, monospace'
                : fontFamily === 'serif' || fontFamily === 'georgia'
                  ? 'Georgia, serif'
                  : fontFamily === 'comic'
                    ? 'Comic Sans MS, cursive'
                    : undefined,
          color:
            textColor === 'default'
              ? undefined
              : textColor === 'slate'
                ? '#334155'
                : textColor === 'brand'
                  ? '#1d4ed8'
                  : textColor === 'rose'
                    ? '#e11d48'
                    : textColor === 'emerald'
                      ? '#059669'
                      : textColor === 'amber'
                        ? '#d97706'
                        : undefined,
        }"
        @keydown.meta.enter.prevent="onSubmit"
        @keydown.ctrl.enter.prevent="onSubmit"
      />

      <div class="flex flex-wrap items-center gap-2">
        <label class="sr-only" for="post-category">{{
          $t("feed.composer.category")
        }}</label>
        <select
          id="post-category"
          v-model="categoryId"
          class="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-200"
        >
          <option value="">{{ $t("feed.composer.noCategory") }}</option>
          <option v-for="cat in categories || []" :key="cat.id" :value="cat.id">
            {{ catLabel(cat) }}
          </option>
        </select>

        <label class="sr-only" for="post-font">{{
          $t("feed.composer.font")
        }}</label>
        <select
          id="post-font"
          v-model="fontFamily"
          class="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-200"
        >
          <option v-for="f in POST_FONT_FAMILIES" :key="f" :value="f">
            {{ fontLabels[f] }}
          </option>
        </select>

        <label class="sr-only" for="post-color">{{
          $t("feed.composer.textColor")
        }}</label>
        <select
          id="post-color"
          v-model="textColor"
          class="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-200"
        >
          <option v-for="c in POST_TEXT_COLORS" :key="c" :value="c">
            {{ colorLabels[c] }}
          </option>
        </select>

        <button
          type="button"
          class="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          :title="$t('feed.composer.insertInlineLatex')"
          @click="insertLatex(false)"
        >
          {{ $t("feed.composer.latexInline") }}
        </button>
        <button
          type="button"
          class="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          :title="$t('feed.composer.insertBlockLatex')"
          @click="insertLatex(true)"
        >
          {{ $t("feed.composer.latexBlock") }}
        </button>
      </div>

      <div v-if="attachments.length" class="flex flex-wrap gap-2">
        <div
          v-for="att in attachments"
          :key="att.id"
          class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700"
        >
          <span class="truncate max-w-[10rem]">{{ att.fileName }}</span>
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

      <div
        class="flex flex-col gap-3 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div class="flex flex-wrap items-center gap-2">
          <label class="sr-only" for="post-visibility">{{
            $t("feed.composer.visibility")
          }}</label>
          <select
            id="post-visibility"
            v-model="visibility"
            class="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-200"
          >
            <option
              v-for="(label, key) in visibilityLabel"
              :key="key"
              :value="key"
            >
              {{ label }}
            </option>
          </select>

          <button
            type="button"
            class="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
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

        <button
          type="submit"
          class="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-200 transition hover:-translate-y-0.5 hover:bg-brand-700 hover:shadow disabled:pointer-events-none disabled:opacity-50"
          :disabled="!canSubmit"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="h-4 w-4"
            aria-hidden="true"
          >
            <path d="m4 4 16 8-16 8 3-8-3-8Z" stroke-linejoin="round" />
            <path d="M7 12h13" stroke-linecap="round" />
          </svg>
          {{ submitLabel || $t("feed.composer.post") }}
        </button>
      </div>

      <div
        v-if="visibility === 'shared'"
        class="space-y-2 rounded-lg border border-slate-100 bg-slate-50/80 p-3"
      >
        <label
          class="block text-xs font-medium text-slate-600"
          for="audience-search"
        >
          {{ $t("feed.composer.shareWith") }}
        </label>
        <div v-if="audience.length" class="flex flex-wrap gap-1.5">
          <span
            v-for="u in audience"
            :key="u.id"
            class="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-800"
          >
            {{ u.name || u.email }}
            <button
              type="button"
              class="text-brand-600 hover:text-rose-600"
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
          id="audience-search"
          v-model="audienceQuery"
          type="search"
          autocomplete="off"
          class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
          :placeholder="$t('feed.composer.searchPeople')"
          aria-describedby="audience-hint"
        />
        <p id="audience-hint" class="sr-only">
          {{ $t("feed.composer.audienceHint") }}
        </p>
        <ul
          v-if="audienceQuery.trim() && (searching || results.length)"
          class="max-h-40 overflow-auto rounded-lg border border-slate-200 bg-white divide-y divide-slate-100"
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
              class="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
              role="option"
              @click="pickAudience(u)"
            >
              <span class="font-medium text-slate-800">{{
                u.name || u.email
              }}</span>
              <span v-if="u.name" class="block text-[11px] text-slate-500">{{
                u.email
              }}</span>
            </button>
          </li>
        </ul>
      </div>

      <p class="text-[11px] text-slate-400 tabular-nums">
        {{ $t("feed.composer.charCount", { count: body.length }) }}
      </p>
    </div>
  </form>
</template>
