<script setup lang="ts">
import { ARTICLE_STATUS_I18N_KEYS } from "~/types/article";

defineProps<{
  status: number | undefined;
  sourceName: string | undefined;
  busy: string | null;
  canEdit: boolean;
  canApprove: boolean;
  hasPublishableContent: boolean;
}>();

const emit = defineEmits<{
  save: [];
  regenerate: [];
  reject: [];
  approve: [];
}>();

const { t } = useI18n();

function statusLabel(status: number): string {
  const key =
    ARTICLE_STATUS_I18N_KEYS[status as keyof typeof ARTICLE_STATUS_I18N_KEYS];
  return key ? t(key) : String(status);
}
</script>

<template>
  <header
    class="px-4 md:px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between flex-wrap gap-3 shrink-0"
  >
    <div>
      <div class="flex items-center gap-2 text-xs text-slate-500 mb-1">
        <NuxtLink to="/admin" class="hover:text-slate-800">
          {{ $t("admin.title") }}
        </NuxtLink>
        <span>/</span>
        <NuxtLink to="/admin/articles/pending" class="hover:text-slate-800">
          {{ $t("adminArticles.breadcrumb") }}
        </NuxtLink>
        <span>/</span>
        <span>{{ $t("adminArticles.review") }}</span>
      </div>
      <h1 class="text-lg font-semibold text-slate-900">
        {{ $t("adminArticles.detailTitle") }}
      </h1>
      <p
        v-if="status !== undefined && sourceName"
        class="text-xs text-slate-500"
      >
        {{ statusLabel(status) }} · {{ sourceName }}
      </p>
    </div>
    <div class="flex flex-wrap items-center gap-2" :aria-busy="!!busy">
      <button
        type="button"
        class="text-xs px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50"
        :disabled="!!busy || !canEdit"
        @click="emit('save')"
      >
        {{ busy === "save" ? $t("common.saving") : $t("adminArticles.save") }}
      </button>
      <button
        type="button"
        class="text-xs px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50"
        :disabled="!!busy || !canEdit"
        @click="emit('regenerate')"
      >
        {{
          busy === "regen"
            ? $t("adminArticles.regenerating")
            : $t("adminArticles.regenerate")
        }}
      </button>
      <button
        type="button"
        class="text-xs px-3 py-1.5 rounded-md border border-rose-200 text-rose-700 bg-white hover:bg-rose-50 disabled:opacity-50"
        :disabled="!!busy || !canEdit"
        @click="emit('reject')"
      >
        {{
          busy === "reject"
            ? $t("adminArticles.rejecting")
            : $t("adminArticles.reject")
        }}
      </button>
      <button
        type="button"
        class="text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
        :disabled="!!busy || !canApprove"
        :title="
          !hasPublishableContent
            ? $t('adminArticles.needContentToApprove')
            : undefined
        "
        @click="emit('approve')"
      >
        {{
          busy === "approve"
            ? $t("adminArticles.approving")
            : $t("adminArticles.approvePublish")
        }}
      </button>
    </div>
  </header>
</template>
