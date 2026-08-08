<script setup lang="ts">
import { useAdminPendingArticleReview } from "~/composables/useAdminPendingArticleReview";

const {
  data,
  loading,
  loadError,
  rewrittenTitle,
  rewrittenContent,
  categoryId,
  previewHtml,
  showPreview,
  busy,
  confirmAction,
  pipelineCategories,
  canEdit,
  canDelete,
  canApprove,
  hasPublishableContent,
  isDraftWithoutAi,
  safeSourceUrl,
  categoryOptionLabel,
  useOriginalInEditor,
  saveEdits,
  regenerate,
  onConfirm,
} = await useAdminPendingArticleReview();
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <AdminArticleReviewHeader
      :status="data?.status"
      :source-name="data?.sourceName"
      :busy="busy"
      :can-edit="canEdit"
      :can-approve="canApprove"
      :has-publishable-content="hasPublishableContent"
      @save="saveEdits"
      @regenerate="regenerate"
      @reject="confirmAction = 'reject'"
      @approve="confirmAction = 'approve'"
    />

    <div
      class="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 space-y-4 pb-24 md:pb-6"
      :aria-busy="loading"
    >
      <p
        v-if="loadError"
        class="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2"
      >
        {{ $t("adminArticles.loadFailed") }}
      </p>
      <SkeletonList v-else-if="loading" :rows="4" variant="card" />

      <template v-else-if="data">
        <p
          v-if="isDraftWithoutAi"
          class="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2"
        >
          {{ $t("adminArticles.draftNoRewriteHint") }}
        </p>

        <AdminArticleReviewMetaBar
          v-model:category-id="categoryId"
          :pipeline-categories="pipelineCategories"
          :can-edit="canEdit"
          :can-delete="canDelete"
          :busy="busy"
          :safe-source-url="safeSourceUrl"
          :category-option-label="categoryOptionLabel"
          @use-original="useOriginalInEditor"
          @delete="confirmAction = 'delete'"
        />

        <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <AdminArticleOriginalPanel
            :original-title="data.originalTitle"
            :raw-content="data.rawContent"
          />
          <AdminArticleRewritePanel
            v-model:rewritten-title="rewrittenTitle"
            v-model:rewritten-content="rewrittenContent"
            v-model:show-preview="showPreview"
            :can-edit="canEdit"
            :preview-html="previewHtml"
          />
        </div>
      </template>
    </div>

    <AdminArticleReviewDialogs
      :confirm-action="confirmAction"
      :busy="busy"
      :article-status="data?.status"
      @cancel="confirmAction = null"
      @confirm="onConfirm"
    />
  </div>
</template>
