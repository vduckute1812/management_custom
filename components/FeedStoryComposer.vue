<script setup lang="ts">
import { UploadKind } from "~/types/post";
import {
  UPLOAD_ACCEPT_IMAGES_ATTR,
  UPLOAD_ALLOWED_IMAGE_EXTENSIONS,
  resolveUploadRule,
} from "~/utils/uploadPolicy";

const open = defineModel<boolean>("open", { required: true });

const { t } = useI18n();
const { pushToast } = useToasts();
const { createStory } = useStories();
const { uploadFile } = useUploads();

const body = ref("");
const uploading = ref(false);
const submitting = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const uploadId = ref<string | null>(null);
const fileName = ref("");
const root = ref<HTMLElement | null>(null);
const bodyInput = ref<HTMLTextAreaElement | null>(null);

const visible = computed(() => open.value);
useModal(visible, {
  container: root,
  initialFocus: bodyInput,
  onClose: () => {
    if (!submitting.value) open.value = false;
  },
});

function reset() {
  body.value = "";
  uploadId.value = null;
  fileName.value = "";
}

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;

  const rule = resolveUploadRule(file.name, file.type);
  if (!rule || rule.kind !== UploadKind.Image) {
    pushToast(
      t("uploads.errors.imageOnly", {
        allowed: UPLOAD_ALLOWED_IMAGE_EXTENSIONS.join(", "),
      }),
      { tone: "danger" },
    );
    return;
  }

  uploading.value = true;
  try {
    const up = await uploadFile(file);
    uploadId.value = up.id;
    fileName.value = up.fileName;
  } catch {
    // uploadFile already surfaced a toast.
  } finally {
    uploading.value = false;
  }
}

async function submit() {
  if (submitting.value) return;
  if (!body.value.trim() && !uploadId.value) return;
  submitting.value = true;
  try {
    await createStory({
      body: body.value.trim() || null,
      uploadId: uploadId.value,
    });
    reset();
    open.value = false;
  } catch {
    // toast
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div
    v-if="open"
    ref="root"
    class="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/50 p-4 sm:items-center"
    role="dialog"
    aria-modal="true"
    aria-labelledby="story-composer-title"
    @click.self="open = false"
  >
    <form
      class="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-xl"
      @submit.prevent="submit"
    >
      <h2
        id="story-composer-title"
        class="text-base font-semibold text-slate-900"
      >
        {{ $t("feed.stories.newStory") }}
      </h2>
      <p class="text-xs text-slate-500">
        {{ $t("feed.stories.visible24h") }}
      </p>
      <label class="sr-only" for="story-body">{{
        $t("feed.stories.storyText")
      }}</label>
      <textarea
        id="story-body"
        ref="bodyInput"
        v-model="body"
        rows="3"
        maxlength="500"
        class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
        :placeholder="$t('feed.stories.placeholder')"
      />
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          :disabled="uploading"
          @click="fileInput?.click()"
        >
          {{
            uploading
              ? $t("feed.stories.uploading")
              : fileName || $t("feed.stories.addPhoto")
          }}
        </button>
        <input
          ref="fileInput"
          type="file"
          class="hidden"
          :accept="UPLOAD_ACCEPT_IMAGES_ATTR"
          @change="onFile"
        />
      </div>
      <div class="flex justify-end gap-2 pt-1">
        <button
          type="button"
          class="px-3 py-2 text-sm text-slate-500"
          @click="open = false"
        >
          {{ $t("feed.stories.cancel") }}
        </button>
        <button
          type="submit"
          class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          :disabled="submitting || uploading || (!body.trim() && !uploadId)"
        >
          {{ $t("feed.stories.shareStory") }}
        </button>
      </div>
    </form>
  </div>
</template>
