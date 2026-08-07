<script setup lang="ts">
import {
  ArticleStatus,
  PIPELINE_CATEGORY_SLUGS,
  type PendingArticleListItem,
} from "~/types/article";
import { apiErrorMessage } from "~/utils/apiErrorMessage";

const { t } = useI18n();
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
const busyToggle = ref(false);
const confirmBulkDelete = ref(false);
const selectedIds = ref<string[]>([]);
const dailyFetchEnabled = ref(true);

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

const { data: settingsData, refresh: refreshSettings } = await useAsyncData(
  "admin:pending-articles-settings",
  async () =>
    await apiFetch<{ dailyFetchEnabled: boolean }>(
      "/api/admin/articles/pending/settings",
    ),
);

watch(
  settingsData,
  (s) => {
    if (s) dailyFetchEnabled.value = !!s.dailyFetchEnabled;
  },
  { immediate: true },
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

async function toggleDailyFetch() {
  const next = !dailyFetchEnabled.value;
  busyToggle.value = true;
  try {
    const res = await apiFetch<{
      ok: true;
      dailyFetchEnabled: boolean;
    }>("/api/admin/articles/pending/settings", {
      method: "PATCH",
      body: { dailyFetchEnabled: next },
    });
    dailyFetchEnabled.value = res.dailyFetchEnabled;
    await refreshSettings();
    pushToast(
      res.dailyFetchEnabled
        ? t("adminArticles.dailyFetchOn")
        : t("adminArticles.dailyFetchOff"),
      { tone: "success" },
    );
  } catch (err: unknown) {
    pushToast(apiErrorMessage(err, t("adminArticles.dailyFetchToggleFailed")), {
      tone: "danger",
    });
  } finally {
    busyToggle.value = false;
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
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <AdminPendingArticlesHeader
      :daily-fetch-enabled="dailyFetchEnabled"
      :selected-count="selectedCount"
      :busy-toggle="busyToggle"
      :busy-delete="busyDelete"
      :busy-fetch="busyFetch"
      :loading="loading"
      @toggle-daily-fetch="toggleDailyFetch"
      @bulk-delete="confirmBulkDelete = true"
      @fetch-now="runFetchNow"
      @refresh="refresh()"
    />

    <div class="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 space-y-4">
      <AdminPendingArticlesFilters
        v-model:status-filter="statusFilter"
        v-model:category-id="categoryId"
        v-model:created-from="createdFrom"
        v-model:created-to="createdTo"
        :pipeline-categories="pipelineCategories"
      />

      <p
        v-if="loadError"
        class="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2"
      >
        {{ $t("adminArticles.loadFailed") }}
      </p>

      <AdminPendingArticlesTable
        :articles="data?.articles || []"
        :total="data?.total ?? 0"
        :loading="loading"
        :status-filter="statusFilter"
        :selected-count="selectedCount"
        :all-page-selected="allPageSelected"
        :some-page-selected="somePageSelected"
        :page-ids="pageIds"
        :busy-delete="busyDelete"
        :is-selected="isSelected"
        @toggle-all-page="toggleAllPage"
        @toggle-one="toggleOne"
        @open-review="openReview"
      />
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
