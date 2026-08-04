<script setup lang="ts">
import dayjs from "dayjs";
import {
  ArticleStatus,
  ARTICLE_STATUS_I18N_KEYS,
  PIPELINE_CATEGORY_SLUGS,
  type PendingArticleListItem,
} from "~/types/article";
import type { PostCategory } from "~/types/post";
import { categoryDisplayName } from "~/utils/categoryLabel";
import { apiErrorMessage } from "~/utils/apiErrorMessage";

const { t, te } = useI18n();
const { apiFetch } = useApi();
const { pushToast } = useToasts();
const { categories, refresh: refreshCategories } = useCategories();

useSeoMeta({
  title: () => t("seo.adminArticles"),
  description: () => t("seo.adminArticlesDescription"),
});

const statusFilter = ref<number>(ArticleStatus.PendingApproval);
const categoryId = ref<string>("");
const createdFrom = ref("");
const createdTo = ref("");
const busyFetch = ref(false);

interface ListResponse {
  articles: PendingArticleListItem[];
  total: number;
}

const {
  data,
  pending: loading,
  refresh,
  error: loadError,
} = await useAsyncData(
  "admin:pending-articles",
  async () => {
    const params = new URLSearchParams();
    params.set("status", String(statusFilter.value));
    if (categoryId.value) params.set("categoryId", categoryId.value);
    if (createdFrom.value) params.set("createdFrom", createdFrom.value);
    if (createdTo.value) params.set("createdTo", createdTo.value);
    params.set("limit", "50");
    return await apiFetch<ListResponse>(
      `/api/admin/articles/pending?${params.toString()}`,
    );
  },
  { watch: [statusFilter, categoryId, createdFrom, createdTo] },
);

await refreshCategories();

const pipelineCategories = computed(() =>
  (categories.value || []).filter((c) =>
    (PIPELINE_CATEGORY_SLUGS as readonly string[]).includes(c.slug),
  ),
);

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

async function runFetchNow() {
  busyFetch.value = true;
  try {
    const res = await apiFetch<{
      ok: true;
      enqueued: boolean;
      reason?: string;
    }>("/api/admin/articles/pending/fetch", {
      method: "POST",
      body: { force: true },
    });
    if (res.enqueued) {
      pushToast(t("adminArticles.fetchQueued"), { tone: "success" });
    } else {
      pushToast(t("adminArticles.fetchAlreadyRunning"), { tone: "info" });
    }
  } catch (err: unknown) {
    pushToast(apiErrorMessage(err, t("adminArticles.fetchFailed")), {
      tone: "danger",
    });
  } finally {
    busyFetch.value = false;
  }
}

function categoryOptionLabel(cat: PostCategory): string {
  return categoryDisplayName(cat, t, te);
}
</script>

<template>
  <div class="flex flex-col h-screen overflow-hidden">
    <header
      class="px-4 md:px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between flex-wrap gap-3"
    >
      <div>
        <div class="flex items-center gap-2 text-xs text-slate-500 mb-1">
          <NuxtLink to="/admin" class="hover:text-slate-800">{{
            $t("admin.title")
          }}</NuxtLink>
          <span>/</span>
          <span>{{ $t("adminArticles.breadcrumb") }}</span>
        </div>
        <h1 class="text-lg font-semibold text-slate-900">
          {{ $t("adminArticles.title") }}
        </h1>
        <p class="text-xs text-slate-500">
          {{ $t("adminArticles.subtitle") }}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="text-xs px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50"
          :disabled="busyFetch"
          @click="runFetchNow"
        >
          {{
            busyFetch
              ? $t("adminArticles.fetching")
              : $t("adminArticles.fetchNow")
          }}
        </button>
        <button
          type="button"
          class="text-xs px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50"
          :disabled="loading"
          @click="refresh()"
        >
          {{ $t("adminArticles.refresh") }}
        </button>
      </div>
    </header>

    <div class="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
      <div
        class="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap gap-3 items-end"
      >
        <label class="flex flex-col gap-1 text-xs text-slate-600">
          <span>{{ $t("adminArticles.filterStatus") }}</span>
          <select
            v-model.number="statusFilter"
            class="border border-slate-300 rounded-md px-2 py-1.5 bg-white min-w-[10rem]"
          >
            <option :value="ArticleStatus.PendingApproval">
              {{ $t("adminArticles.statusPending") }}
            </option>
            <option :value="ArticleStatus.Draft">
              {{ $t("adminArticles.statusDraft") }}
            </option>
            <option :value="ArticleStatus.Approved">
              {{ $t("adminArticles.statusApproved") }}
            </option>
            <option :value="ArticleStatus.Rejected">
              {{ $t("adminArticles.statusRejected") }}
            </option>
          </select>
        </label>
        <label class="flex flex-col gap-1 text-xs text-slate-600">
          <span>{{ $t("adminArticles.filterCategory") }}</span>
          <select
            v-model="categoryId"
            class="border border-slate-300 rounded-md px-2 py-1.5 bg-white min-w-[12rem]"
          >
            <option value="">{{ $t("adminArticles.allCategories") }}</option>
            <option
              v-for="cat in pipelineCategories"
              :key="cat.id"
              :value="cat.id"
            >
              {{ categoryOptionLabel(cat) }}
            </option>
          </select>
        </label>
        <label class="flex flex-col gap-1 text-xs text-slate-600">
          <span>{{ $t("adminArticles.filterFrom") }}</span>
          <input
            v-model="createdFrom"
            type="date"
            class="border border-slate-300 rounded-md px-2 py-1.5 bg-white"
          />
        </label>
        <label class="flex flex-col gap-1 text-xs text-slate-600">
          <span>{{ $t("adminArticles.filterTo") }}</span>
          <input
            v-model="createdTo"
            type="date"
            class="border border-slate-300 rounded-md px-2 py-1.5 bg-white"
          />
        </label>
      </div>

      <p
        v-if="loadError"
        class="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2"
      >
        {{ $t("adminArticles.loadFailed") }}
      </p>

      <div class="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div
          class="px-4 py-2 border-b border-slate-100 text-xs text-slate-500 flex justify-between"
        >
          <span>{{
            $t("adminArticles.totalCount", { count: data?.total ?? 0 })
          }}</span>
          <span v-if="loading">{{ $t("admin.loading") }}</span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th class="px-4 py-2 font-medium">
                  {{ $t("adminArticles.colOriginal") }}
                </th>
                <th class="px-4 py-2 font-medium">
                  {{ $t("adminArticles.colRewritten") }}
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
              <tr v-if="!loading && !data?.articles?.length">
                <td
                  colspan="7"
                  class="px-4 py-8 text-center text-slate-400 text-xs"
                >
                  {{ $t("adminArticles.empty") }}
                </td>
              </tr>
              <tr
                v-for="article in data?.articles || []"
                :key="article.id"
                class="border-t border-slate-100 hover:bg-slate-50/80"
              >
                <td class="px-4 py-3 align-top max-w-[14rem]">
                  <p class="text-slate-800 line-clamp-2">
                    {{ article.originalTitle }}
                  </p>
                </td>
                <td class="px-4 py-3 align-top max-w-[14rem]">
                  <p class="text-slate-700 line-clamp-2">
                    {{ article.rewrittenTitle || $t("common.emDash") }}
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
                <td class="px-4 py-3 align-top">
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
    </div>
  </div>
</template>
