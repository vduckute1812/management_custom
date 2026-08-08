<script setup lang="ts">
import { PostVisibility } from "~/types/post";
import { UPLOAD_MAX_PER_POST } from "~/utils/uploadPolicy";

const props = defineProps<{
  visibilityOptions: { value: PostVisibility; label: string }[];
  uploading: boolean;
  attachmentCount: number;
  canSubmit: boolean;
  submitLabel?: string;
  submitting?: boolean;
}>();

const emit = defineEmits<{
  (e: "attach-click"): void;
}>();

const visibility = defineModel<PostVisibility>("visibility", {
  required: true,
});

const attachDisabled = computed(
  () => props.uploading || props.attachmentCount >= UPLOAD_MAX_PER_POST,
);
</script>

<template>
  <div
    class="flex flex-col gap-3 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between"
  >
    <div class="flex flex-wrap items-center gap-2">
      <label class="sr-only" for="post-visibility">{{
        $t("feed.composer.visibility")
      }}</label>
      <select
        id="post-visibility"
        v-model.number="visibility"
        class="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-200"
      >
        <option
          v-for="opt in visibilityOptions"
          :key="opt.value"
          :value="opt.value"
        >
          {{ opt.label }}
        </option>
      </select>

      <button
        type="button"
        class="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        :disabled="attachDisabled"
        @click="emit('attach-click')"
      >
        {{
          uploading ? $t("feed.composer.uploading") : $t("feed.composer.attach")
        }}
      </button>
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
</template>
