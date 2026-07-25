<script setup lang="ts">
import type { PostAuthor, PostVisibility, UploadRecord } from "~/types/post";

const props = defineProps<{
  submitting?: boolean;
  placeholder?: string;
  submitLabel?: string;
}>();

const emit = defineEmits<{
  (
    e: "submit",
    payload: {
      body: string;
      visibility: PostVisibility;
      audienceUserIds: string[];
      attachmentIds: string[];
    }
  ): void;
}>();

const { uploadFile } = useUploads();
const { results, loading: searching, searchDebounced } = useUserDirectory();

const body = ref("");
const visibility = ref<PostVisibility>("public");
const audience = ref<PostAuthor[]>([]);
const audienceQuery = ref("");
const attachments = ref<UploadRecord[]>([]);
const uploading = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const textareaEl = ref<HTMLTextAreaElement | null>(null);

const canSubmit = computed(
  () =>
    body.value.trim().length > 0 &&
    !props.submitting &&
    !uploading.value &&
    (visibility.value !== "shared" || audience.value.length > 0)
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
  uploading.value = true;
  try {
    for (const file of files) {
      if (attachments.value.length >= 10) break;
      const uploaded = await uploadFile(file);
      attachments.value = [...attachments.value, uploaded];
    }
  } finally {
    uploading.value = false;
  }
}

function removeAttachment(id: string) {
  attachments.value = attachments.value.filter((a) => a.id !== id);
}

function onSubmit() {
  if (!canSubmit.value) return;
  emit("submit", {
    body: body.value.trim(),
    visibility: visibility.value,
    audienceUserIds: audience.value.map((u) => u.id),
    attachmentIds: attachments.value.map((a) => a.id),
  });
}

function clear() {
  body.value = "";
  visibility.value = "public";
  audience.value = [];
  audienceQuery.value = "";
  attachments.value = [];
}

function focus() {
  textareaEl.value?.focus();
}

defineExpose({ clear, focus });

const visibilityLabel: Record<PostVisibility, string> = {
  public: "Public",
  private: "Only me",
  shared: "Specific people",
};
</script>

<template>
  <form
    class="rounded-xl border border-slate-200 bg-white p-4 space-y-3"
    @submit.prevent="onSubmit"
  >
    <label class="sr-only" for="post-composer">Write a post</label>
    <textarea
      id="post-composer"
      ref="textareaEl"
      v-model="body"
      rows="3"
      maxlength="5000"
      class="w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-300"
      :placeholder="placeholder || 'Write a document, share a story…'"
      :disabled="submitting"
      @keydown.meta.enter.prevent="onSubmit"
      @keydown.ctrl.enter.prevent="onSubmit"
    />

    <div
      v-if="attachments.length"
      class="flex flex-wrap gap-2"
    >
      <div
        v-for="att in attachments"
        :key="att.id"
        class="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700"
      >
        <span class="truncate max-w-[10rem]">{{ att.fileName }}</span>
        <button
          type="button"
          class="text-slate-400 hover:text-rose-600"
          :aria-label="`Remove ${att.fileName}`"
          @click="removeAttachment(att.id)"
        >
          ×
        </button>
      </div>
    </div>

    <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex flex-wrap items-center gap-2">
        <label class="sr-only" for="post-visibility">Visibility</label>
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
          :disabled="uploading || attachments.length >= 10"
          @click="fileInput?.click()"
        >
          {{ uploading ? "Uploading…" : "Attach" }}
        </button>
        <input
          ref="fileInput"
          type="file"
          class="hidden"
          multiple
          accept=".jpg,.jpeg,.png,.webp,.gif,.pdf,.txt,.md,.docx,image/*,application/pdf,text/plain,text/markdown"
          @change="onFilesSelected"
        />
      </div>

      <button
        type="submit"
        class="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 disabled:pointer-events-none transition"
        :disabled="!canSubmit"
      >
        {{ submitLabel || "Post" }}
      </button>
    </div>

    <div v-if="visibility === 'shared'" class="space-y-2 rounded-lg border border-slate-100 bg-slate-50/80 p-3">
      <label class="block text-xs font-medium text-slate-600" for="audience-search">
        Share with
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
            :aria-label="`Remove ${u.name || u.email}`"
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
        placeholder="Search by name or email…"
        aria-describedby="audience-hint"
      />
      <p id="audience-hint" class="sr-only">
        Type to find people on this install to share with.
      </p>
      <ul
        v-if="audienceQuery.trim() && (searching || results.length)"
        class="max-h-40 overflow-auto rounded-lg border border-slate-200 bg-white divide-y divide-slate-100"
        role="listbox"
      >
        <li v-if="searching" class="px-3 py-2 text-xs text-slate-400">
          Searching…
        </li>
        <li
          v-for="u in results.filter((r) => !audience.some((a) => a.id === r.id))"
          :key="u.id"
        >
          <button
            type="button"
            class="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
            role="option"
            @click="pickAudience(u)"
          >
            <span class="font-medium text-slate-800">{{ u.name || u.email }}</span>
            <span v-if="u.name" class="block text-[11px] text-slate-500">{{ u.email }}</span>
          </button>
        </li>
      </ul>
    </div>

    <p class="text-[11px] text-slate-400 tabular-nums">
      {{ body.length }}/5000 · ⌘/Ctrl+Enter to post
    </p>
  </form>
</template>
