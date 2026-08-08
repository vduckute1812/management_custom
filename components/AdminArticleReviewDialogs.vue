<script setup lang="ts">
import { ArticleStatus } from "~/types/article";

defineProps<{
  confirmAction: "approve" | "reject" | "delete" | null;
  busy: string | null;
  articleStatus: number | undefined;
}>();

const emit = defineEmits<{
  cancel: [];
  confirm: [];
}>();
</script>

<template>
  <ConfirmDialog
    :open="confirmAction === 'approve'"
    :title="$t('adminArticles.approveConfirmTitle')"
    :description="$t('adminArticles.approveConfirm')"
    :busy="busy === 'approve'"
    :destructive="false"
    :confirm-label="$t('adminArticles.approvePublish')"
    @cancel="emit('cancel')"
    @confirm="emit('confirm')"
  />
  <ConfirmDialog
    :open="confirmAction === 'reject'"
    :title="$t('adminArticles.rejectConfirmTitle')"
    :description="$t('adminArticles.rejectConfirm')"
    :busy="busy === 'reject'"
    :confirm-label="$t('adminArticles.reject')"
    @cancel="emit('cancel')"
    @confirm="emit('confirm')"
  />
  <ConfirmDialog
    :open="confirmAction === 'delete'"
    :title="$t('adminArticles.deleteConfirmTitle')"
    :description="
      articleStatus === ArticleStatus.Approved
        ? $t('adminArticles.deleteConfirmApproved')
        : $t('adminArticles.deleteConfirm')
    "
    :busy="busy === 'delete'"
    :confirm-label="$t('adminArticles.deleteForever')"
    @cancel="emit('cancel')"
    @confirm="emit('confirm')"
  />
</template>
