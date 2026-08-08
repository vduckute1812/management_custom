<script setup lang="ts">
import dayjs from "dayjs";
import {
  ArticleStatus,
  ARTICLE_STATUS_I18N_KEYS,
  type PendingArticleListItem,
} from "~/types/article";
import { categoryDisplayName } from "~/utils/categoryLabel";

defineProps<{
  articles: PendingArticleListItem[];
  total: number;
  loading: boolean;
  statusFilter: number;
  selectedCount: number;
  allPageSelected: boolean;
  somePageSelected: boolean;
  pageIds: string[];
  busyDelete: boolean;
  isSelected: (id: string) => boolean;
}>();

const emit = defineEmits<{
  toggleAllPage: [checked: boolean];
  toggleOne: [id: string, checked: boolean];
  openReview: [id: string];
}>();

const { t, te } = useI18n();

function statusLabel(status: number): string {
  const key =
    ARTICLE_STATUS_I18N_KEYS[status as keyof typeof ARTICLE_STATUS_I18N_KEYS];
  return key ? t(key) : String(status);
}

function catLabel(article: PendingArticleListItem): string {
  if (!article.categorySlug || !article.categoryName) {
    return t("adminArticles.uncategorized");
  }
  return categoryDisplayName(
    { slug: article.categorySlug, name: article.categoryName },
    t,
    te,
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return t("common.emDash");
  return dayjs(iso).format("MMM D, YYYY · HH:mm");
}

function previewText(article: PendingArticleListItem): string {
  const text = (article.excerpt || "").trim();
  if (!text) return "";
  return text.length > 180 ? `${text.slice(0, 177)}…` : text;
}
</script>

<template>
  <div
    class="bg-white border border-slate-200 rounded-xl overflow-hidden"
    :aria-busy="loading"
  >
    <div
      class="px-4 py-2 border-b border-slate-100 text-xs text-slate-500 flex justify-between gap-3 flex-wrap"
    >
      <span>{{ $t("adminArticles.totalCount", { count: total }) }}</span>
      <span v-if="selectedCount > 0" class="text-slate-700">
        {{ $t("adminArticles.selectedCount", { count: selectedCount }) }}
      </span>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-slate-50 text-left text-xs text-slate-500">
          <tr>
            <th class="px-3 py-2 w-10">
              <input
                type="checkbox"
                class="rounded border-slate-300"
                :checked="allPageSelected"
                :indeterminate.prop="somePageSelected"
                :aria-label="$t('adminArticles.selectAll')"
                :disabled="!pageIds.length || busyDelete"
                @change="
                  emit(
                    'toggleAllPage',
                    ($event.target as HTMLInputElement).checked,
                  )
                "
              />
            </th>
            <th class="px-4 py-2 font-medium">
              {{ $t("adminArticles.colArticle") }}
            </th>
            <th class="px-4 py-2 font-medium">
              {{ $t("adminArticles.colCategory") }}
            </th>
            <th class="px-4 py-2 font-medium">
              {{ $t("adminArticles.colSource") }}
            </th>
            <th class="px-4 py-2 font-medium">
              {{ $t("adminArticles.colFetched") }}
            </th>
            <th class="px-4 py-2 font-medium">
              {{ $t("adminArticles.colStatus") }}
            </th>
            <th class="px-4 py-2 font-medium">
              {{ $t("admin.colActions") }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading && !articles.length">
            <td colspan="7" class="p-0">
              <SkeletonList :rows="5" />
            </td>
          </tr>
          <tr v-if="!loading && !articles.length">
            <td colspan="7" class="px-4 py-8">
              <EmptyState
                :title="$t('adminArticles.empty')"
                :description="
                  statusFilter === ArticleStatus.PendingApproval
                    ? $t('adminArticles.emptyPendingHint')
                    : undefined
                "
                illustration="layers"
              />
            </td>
          </tr>
          <tr
            v-for="article in articles"
            :key="article.id"
            class="border-t border-slate-100 hover:bg-sky-50/60 cursor-pointer"
            :class="{ 'bg-sky-50/40': isSelected(article.id) }"
            tabindex="0"
            role="link"
            :aria-label="$t('adminArticles.review')"
            @click="emit('openReview', article.id)"
            @keydown.enter.prevent="emit('openReview', article.id)"
          >
            <td class="px-3 py-3 align-top" @click.stop>
              <input
                type="checkbox"
                class="rounded border-slate-300"
                :checked="isSelected(article.id)"
                :aria-label="$t('adminArticles.selectRow')"
                :disabled="busyDelete"
                @change="
                  emit(
                    'toggleOne',
                    article.id,
                    ($event.target as HTMLInputElement).checked,
                  )
                "
              />
            </td>
            <td class="px-4 py-3 align-top max-w-[28rem]">
              <p class="text-slate-900 font-medium line-clamp-2">
                {{ article.rewrittenTitle || article.originalTitle }}
              </p>
              <p
                v-if="
                  article.rewrittenTitle &&
                  article.rewrittenTitle !== article.originalTitle
                "
                class="text-xs text-slate-500 mt-0.5 line-clamp-1"
              >
                {{ article.originalTitle }}
              </p>
              <p
                v-if="previewText(article)"
                class="text-xs text-slate-600 mt-1.5 line-clamp-3 leading-relaxed"
              >
                {{ previewText(article) }}
              </p>
              <p v-else class="text-xs text-slate-400 mt-1.5 italic">
                {{ $t("adminArticles.openToReadBody") }}
              </p>
            </td>
            <td class="px-4 py-3 align-top whitespace-nowrap text-xs">
              {{ catLabel(article) }}
            </td>
            <td class="px-4 py-3 align-top whitespace-nowrap text-xs">
              {{ article.sourceName }}
            </td>
            <td class="px-4 py-3 align-top whitespace-nowrap text-xs">
              {{ formatDate(article.createdAt) }}
            </td>
            <td class="px-4 py-3 align-top whitespace-nowrap text-xs">
              {{ statusLabel(article.status) }}
            </td>
            <td class="px-4 py-3 align-top" @click.stop>
              <NuxtLink
                :to="`/admin/articles/pending/${article.id}`"
                class="text-xs text-sky-700 hover:underline"
              >
                {{ $t("adminArticles.review") }}
              </NuxtLink>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
