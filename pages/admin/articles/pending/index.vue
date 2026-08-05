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
const router = useRouter();
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
const busyDelete = ref(false);
const confirmBulkDelete = ref(false);
const selectedIds = ref<string[]>([]);

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

watch([statusFilter, categoryId, createdFrom, createdTo], () => {
  selectedIds.value = [];
  confirmBulkDelete.value = false;
});

watch(
  () => data.value?.articles,
  (articles) => {
    const alive = new Set((articles || []).map((a) => a.id));
    selectedIds.value = selectedIds.value.filter((id) => alive.has(id));
  },
);

const pipelineCategories = computed(() =>
  (categories.value || []).filter((c) =>
    (PIPELINE_CATEGORY_SLUGS as readonly string[]).includes(c.slug),
  ),
);

const pageIds = computed(() => (data.value?.articles || []).map((a) => a.id));

const allPageSelected = computed(() => {
  const ids = pageIds.value;
  return ids.length > 0 && ids.every((id) => selectedIds.value.includes(id));
});

const somePageSelected = computed(() => {
  const ids = pageIds.value;
  const n = ids.filter((id) => selectedIds.value.includes(id)).length;
  return n > 0 && n < ids.length;
});

const selectedCount = computed(() => selectedIds.value.length);

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

function openReview(articleId: string) {
  void router.push(`/admin/articles/pending/${articleId}`);
}

function isSelected(id: string): boolean {
  return selectedIds.value.includes(id);
}

function toggleOne(id: string, checked: boolean) {
  if (checked) {
    if (!selectedIds.value.includes(id)) {
      selectedIds.value = [...selectedIds.value, id];
    }
  } else {
    selectedIds.value = selectedIds.value.filter((x) => x !== id);
  }
}

function toggleAllPage(checked: boolean) {
  if (checked) {
    const set = new Set(selectedIds.value);
    for (const id of pageIds.value) set.add(id);
    selectedIds.value = [...set];
  } else {
    const drop = new Set(pageIds.value);
    selectedIds.value = selectedIds.value.filter((id) => !drop.has(id));
  }
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

async function runBulkDelete() {
  if (!selectedIds.value.length) return;
  busyDelete.value = true;
  confirmBulkDelete.value = false;
  try {
    const res = await apiFetch<{
      ok: true;
      deleted: number;
      removedPosts: number;
      missing: number;
    }>("/api/admin/articles/pending/bulk-delete", {
      method: "POST",
      body: { ids: selectedIds.value },
    });
    selectedIds.value = [];
    pushToast(
      res.removedPosts > 0
        ? t("adminArticles.bulkDeletedWithPosts", {
            count: res.deleted,
            posts: res.removedPosts,
          })
        : t("adminArticles.bulkDeleted", { count: res.deleted }),
      { tone: "success" },
    );
    await refresh();
  } catch (err: unknown) {
    pushToast(apiErrorMessage(err, t("adminArticles.bulkDeleteFailed")), {
      tone: "danger",
    });
  } finally {
    busyDelete.value = false;
  }
}

function categoryOptionLabel(cat: PostCategory): string {
  return categoryDisplayName(cat, t, te);
}
</script>

<template>
  <div class="flex flex-col h-screen overflow-hidden">
    <header
      class="px-4 md:px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between flex-wrap gap-3 shrink-0"
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
      <div class="flex items-center gap-2 flex-wrap">
        <button
          v-if="selectedCount > 0"
          type="button"
          class="text-xs px-3 py-1.5 rounded-md border border-rose-200 text-rose-700 bg-white hover:bg-rose-50 disabled:opacity-50"
          :disabled="busyDelete || busyFetch"
          @click="confirmBulkDelete = true"
        >
          {{
            busyDelete
              ? $t("common.deleting")
              : $t("adminArticles.bulkDelete", { count: selectedCount })
          }}
        </button>
        <button
          type="button"
          class="text-xs px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50"
          :disabled="busyFetch || busyDelete"
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
          :disabled="loading || busyDelete"
          @click="refresh()"
        >
          {{ $t("adminArticles.refresh") }}
        </button>
      </div>
    </header>

    <div class="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 space-y-4">
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
          class="px-4 py-2 border-b border-slate-100 text-xs text-slate-500 flex justify-between gap-3 flex-wrap"
        >
          <span>{{
            $t("adminArticles.totalCount", { count: data?.total ?? 0 })
          }}</span>
          <span v-if="selectedCount > 0" class="text-slate-700">
            {{ $t("adminArticles.selectedCount", { count: selectedCount }) }}
          </span>
          <span v-if="loading">{{ $t("admin.loading") }}</span>
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
                      toggleAllPage(($event.target as HTMLInputElement).checked)
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
              <tr v-if="!loading && !data?.articles?.length">
                <td
                  colspan="7"
                  class="px-4 py-8 text-center text-slate-400 text-xs space-y-2"
                >
                  <p>{{ $t("adminArticles.empty") }}</p>
                  <p
                    v-if="statusFilter === ArticleStatus.PendingApproval"
                    class="text-slate-500"
                  >
                    {{ $t("adminArticles.emptyPendingHint") }}
                  </p>
                </td>
              </tr>
              <tr
                v-for="article in data?.articles || []"
                :key="article.id"
                class="border-t border-slate-100 hover:bg-sky-50/60 cursor-pointer"
                :class="{ 'bg-sky-50/40': isSelected(article.id) }"
                tabindex="0"
                role="link"
                :aria-label="$t('adminArticles.review')"
                @click="openReview(article.id)"
                @keydown.enter.prevent="openReview(article.id)"
              >
                <td class="px-3 py-3 align-top" @click.stop>
                  <input
                    type="checkbox"
                    class="rounded border-slate-300"
                    :checked="isSelected(article.id)"
                    :aria-label="$t('adminArticles.selectRow')"
                    :disabled="busyDelete"
                    @change="
                      toggleOne(
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
    </div>

    <ConfirmDialog
      :open="confirmBulkDelete"
      :title="$t('adminArticles.bulkDeleteConfirmTitle')"
      :description="
        statusFilter === ArticleStatus.Approved
          ? $t('adminArticles.bulkDeleteConfirmApproved', {
              count: selectedCount,
            })
          : $t('adminArticles.bulkDeleteConfirm', { count: selectedCount })
      "
      :busy="busyDelete"
      :confirm-label="$t('adminArticles.bulkDelete', { count: selectedCount })"
      @cancel="confirmBulkDelete = false"
      @confirm="runBulkDelete"
    />
  </div>
</template>
