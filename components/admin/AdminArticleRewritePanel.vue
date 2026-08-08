<script setup lang="ts">
defineProps<{
  canEdit: boolean;
  previewHtml: string;
}>();

const rewrittenTitle = defineModel<string>("rewrittenTitle", {
  required: true,
});
const rewrittenContent = defineModel<string>("rewrittenContent", {
  required: true,
});
const showPreview = defineModel<boolean>("showPreview", { required: true });
</script>

<template>
  <section
    class="bg-white border border-slate-200 rounded-xl p-4 flex flex-col h-[min(70vh,36rem)] gap-3"
  >
    <div class="flex items-center justify-between gap-2 shrink-0">
      <h2 class="text-sm font-semibold text-slate-800">
        {{ $t("adminArticles.rewritePanel") }}
      </h2>
      <label class="text-xs text-slate-500 flex items-center gap-1.5">
        <input v-model="showPreview" type="checkbox" />
        {{ $t("adminArticles.showPreview") }}
      </label>
    </div>
    <label class="flex flex-col gap-1 text-xs text-slate-600 shrink-0">
      <span>{{ $t("adminArticles.rewrittenTitle") }}</span>
      <input
        v-model="rewrittenTitle"
        type="text"
        maxlength="160"
        class="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
        :disabled="!canEdit"
      />
    </label>
    <label class="flex flex-col gap-1 text-xs text-slate-600 flex-1 min-h-0">
      <span class="shrink-0">{{ $t("adminArticles.rewrittenBody") }}</span>
      <textarea
        v-model="rewrittenContent"
        class="flex-1 min-h-0 w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono leading-relaxed resize-none"
        :disabled="!canEdit"
        :placeholder="$t('adminArticles.rewritePlaceholder')"
      />
    </label>
    <!-- eslint-disable vue/no-v-html -- renderPostBody sanitizes this preview with DOMPurify. -->
    <div
      v-if="showPreview"
      class="border border-slate-100 rounded-lg p-3 bg-slate-50 max-h-40 overflow-y-auto prose prose-sm max-w-none shrink-0"
      aria-live="polite"
      v-html="previewHtml"
    />
    <!-- eslint-enable vue/no-v-html -->
  </section>
</template>
