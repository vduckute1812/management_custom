<script setup lang="ts">
import type {
  PostAuthor,
  PostCategory,
  PostFontFamily,
  PostTextColor,
  UploadRecord,
} from "~/types/post";
import { PostFormat, PostVisibility } from "~/types/post";
import { POST_BODY_MAX_UPDATE } from "~/utils/postBodyLimits";
import { UPLOAD_ACCEPT_ATTR } from "~/utils/uploadPolicy";

const props = defineProps<{
  submitting?: boolean;
  placeholder?: string;
  submitLabel?: string;
  categories?: PostCategory[];
  /** Prefill when editing an existing update post. */
  initial?: {
    body?: string;
    visibility?: PostVisibility;
    audience?: PostAuthor[];
    attachments?: UploadRecord[];
    categoryId?: string | null;
    fontFamily?: PostFontFamily;
    textColor?: PostTextColor;
  };
}>();

const emit = defineEmits<{
  (
    e: "submit",
    payload: {
      format: PostFormat;
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

const { t } = useI18n();
const auth = useAuth();

const body = ref(props.initial?.body ?? "");
const visibility = ref<PostVisibility>(
  props.initial?.visibility ?? PostVisibility.Friends,
);
const categoryId = ref(props.initial?.categoryId ?? "");
const fontFamily = ref<PostFontFamily>(props.initial?.fontFamily ?? "default");
const textColor = ref<PostTextColor>(props.initial?.textColor ?? "default");
const editor = ref<{
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
  fileInput,
  onFilesSelected,
  removeAttachment,
  clearAttachments,
} = useComposerAttachments(props.initial?.attachments);

const userLabel = computed(
  () => auth.user.value?.name || auth.user.value?.email || t("nav.account"),
);

const canSubmit = computed(
  () =>
    body.value.trim().length > 0 &&
    !props.submitting &&
    !uploading.value &&
    (visibility.value !== PostVisibility.Shared || audience.value.length > 0),
);

function insertLatex(block = false) {
  editor.value?.insertAtCursor(block ? "$$\nE = mc^2\n$$" : "$E = mc^2$");
}

function onSubmit() {
  if (!canSubmit.value) return;
  emit("submit", {
    format: PostFormat.Update,
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
  visibility.value = PostVisibility.Friends;
  categoryId.value = "";
  fontFamily.value = "default";
  textColor.value = "default";
  clearAudience();
  clearAttachments();
}

function focus() {
  editor.value?.focus();
}

defineExpose({ clear, focus });

const visibilityOptions = computed(() => [
  { value: PostVisibility.Friends, label: t("feed.composer.friends") },
  { value: PostVisibility.Public, label: t("feed.composer.public") },
  { value: PostVisibility.Private, label: t("feed.composer.onlyMe") },
  { value: PostVisibility.Shared, label: t("feed.composer.specificPeople") },
]);

const visibilityLabel = computed(
  () =>
    visibilityOptions.value.find((opt) => opt.value === visibility.value)
      ?.label ?? t("feed.composer.public"),
);

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
    <PostComposerHeader
      :name="auth.user.value?.name"
      :email="auth.user.value?.email"
      :avatar-url="auth.user.value?.avatarUrl"
      :user-label="userLabel"
      :visibility-label="visibilityLabel"
    />

    <div class="space-y-3 p-4 sm:p-5">
      <PostComposerEditor
        ref="editor"
        v-model="body"
        :placeholder="placeholder"
        :submitting="submitting"
        :font-family="fontFamily"
        :text-color="textColor"
        @submit="onSubmit"
      />

      <PostComposerToolbar
        v-model:category-id="categoryId"
        v-model:font-family="fontFamily"
        v-model:text-color="textColor"
        :categories="categories"
        :font-labels="fontLabels"
        :color-labels="colorLabels"
        @insert-inline-latex="insertLatex(false)"
        @insert-block-latex="insertLatex(true)"
      />

      <PostComposerAttachments
        :attachments="attachments"
        @remove="removeAttachment"
      />

      <PostComposerFooter
        v-model:visibility="visibility"
        :visibility-options="visibilityOptions"
        :uploading="uploading"
        :attachment-count="attachments.length"
        :can-submit="canSubmit"
        :submit-label="submitLabel"
        :submitting="submitting"
        @attach-click="fileInput?.click()"
      />

      <PostComposerAudience
        v-if="visibility === PostVisibility.Shared"
        v-model="audienceQuery"
        :audience="audience"
        :results="results"
        :searching="searching"
        @pick="pickAudience"
        @remove="removeAudience"
      />

      <p class="text-[11px] text-slate-400 tabular-nums">
        {{
          $t("feed.composer.charCount", {
            count: body.length,
            max: POST_BODY_MAX_UPDATE,
          })
        }}
      </p>

      <input
        ref="fileInput"
        type="file"
        class="hidden"
        multiple
        :accept="UPLOAD_ACCEPT_ATTR"
        @change="onFilesSelected"
      />
    </div>
  </form>
</template>
