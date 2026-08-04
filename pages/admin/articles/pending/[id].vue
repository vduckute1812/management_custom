<script setup lang="ts">
import {
  ArticleStatus,
  ARTICLE_STATUS_I18N_KEYS,
  type PendingArticle,
} from "~/types/article";
import type { PostCategory } from "~/types/post";
import { categoryDisplayName } from "~/utils/categoryLabel";
import { apiErrorMessage } from "~/utils/apiErrorMessage";
import { renderPostBody } from "~/utils/renderPostBody";

const { t, te } = useI18n();
const route = useRoute();
const router = useRouter();
const { apiFetch } = useApi();
const { pushToast } = useToasts();
const { categories, refresh: refreshCategories } = useCategories();

const id = computed(() => String(route.params.id || ""));

useSeoMeta({
  title: () => t("seo.adminArticleReview"),
  description: () => t("seo.adminArticlesDescription"),
});

const {
  data,
  pending: loading,
  refresh,
  error: loadError,
} = await useAsyncData(
  () => `admin:pending-article:${id.value}`,
  async () => {
    const res = await apiFetch<{ article: PendingArticle }>(
      `/api/admin/articles/pending/${id.value}`,
    );
    return res.article;
  },
  { watch: [id] },
);

await refreshCategories();

const rewrittenTitle = ref("");
const rewrittenContent = ref("");
const categoryId = ref<string>("");
const previewHtml = ref("");
const showPreview = ref(true);
const busy = ref<string | null>(null);

watch(
  data,
  (article) => {
    if (!article) return;
    rewrittenTitle.value = article.rewrittenTitle || "";
    rewrittenContent.value = article.rewrittenContent || "";
    categoryId.value = article.categoryId || "";
  },
  { immediate: true },
);

watch(
  rewrittenContent,
  async (body) => {
    if (!showPreview.value) return;
    previewHtml.value = body ? await renderPostBody(body) : "";
  },
  { immediate: true },
);

watch(showPreview, async (on) => {
  if (on && rewrittenContent.value) {
    previewHtml.value = await renderPostBody(rewrittenContent.value);
  }
});

const pipelineCategories = computed(() =>
  (categories.value || []).filter((c) =>
    [
      "electronics",
      "mechanical-engineering",
      "information-technology",
      "iot",
      "math",
      "docs",
      "ideas",
    ].includes(c.slug),
  ),
);

const canMutate = computed(() => {
  const s = data.value?.status;
  return (
    s === ArticleStatus.Draft ||
    s === ArticleStatus.PendingApproval ||
    s === ArticleStatus.Rejected
  );
});

function statusLabel(status: number): string {
  const key =
    ARTICLE_STATUS_I18N_KEYS[status as keyof typeof ARTICLE_STATUS_I18N_KEYS];
  return key ? t(key) : String(status);
}

function categoryOptionLabel(cat: PostCategory): string {
  return categoryDisplayName(cat, t, te);
}

async function saveEdits() {
  if (!canMutate.value) return;
  busy.value = "save";
  try {
    const res = await apiFetch<{ article: PendingArticle }>(
      `/api/admin/articles/pending/${id.value}`,
      {
        method: "PATCH",
        body: {
          rewrittenTitle: rewrittenTitle.value,
          rewrittenContent: rewrittenContent.value,
          categoryId: categoryId.value || null,
        },
      },
    );
    data.value = res.article;
    pushToast(t("adminArticles.saved"), { tone: "success" });
  } catch (err: unknown) {
    pushToast(apiErrorMessage(err, t("adminArticles.saveFailed")), {
      tone: "danger",
    });
  } finally {
    busy.value = null;
  }
}

async function approve() {
  if (!canMutate.value) return;
  busy.value = "approve";
  try {
    const res = await apiFetch<{
      ok: true;
      article: PendingArticle;
      postId: string;
    }>(`/api/admin/articles/pending/${id.value}/approve`, {
      method: "POST",
      body: {
        rewrittenTitle: rewrittenTitle.value,
        rewrittenContent: rewrittenContent.value,
        categoryId: categoryId.value || null,
      },
    });
    data.value = res.article;
    pushToast(t("adminArticles.approved"), { tone: "success" });
    await router.push("/feed");
  } catch (err: unknown) {
    pushToast(apiErrorMessage(err, t("adminArticles.approveFailed")), {
      tone: "danger",
    });
  } finally {
    busy.value = null;
  }
}

async function reject(deleteRow = false) {
  if (!canMutate.value) return;
  busy.value = deleteRow ? "delete" : "reject";
  try {
    await apiFetch(`/api/admin/articles/pending/${id.value}/reject`, {
      method: "POST",
      body: { delete: deleteRow },
    });
    pushToast(
      deleteRow ? t("adminArticles.deleted") : t("adminArticles.rejected"),
      { tone: "success" },
    );
    await router.push("/admin/articles/pending");
  } catch (err: unknown) {
    pushToast(apiErrorMessage(err, t("adminArticles.rejectFailed")), {
      tone: "danger",
    });
  } finally {
    busy.value = null;
  }
}

async function regenerate() {
  if (!canMutate.value) return;
  busy.value = "regen";
  try {
    const res = await apiFetch<{ ok: true; article: PendingArticle }>(
      `/api/admin/articles/pending/${id.value}/regenerate`,
      { method: "POST" },
    );
    data.value = res.article;
    pushToast(t("adminArticles.regenQueued"), { tone: "success" });
    // Poll briefly for rewrite completion.
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 2500));
      await refresh();
      if (data.value?.status === ArticleStatus.PendingApproval) {
        rewrittenTitle.value = data.value.rewrittenTitle || "";
        rewrittenContent.value = data.value.rewrittenContent || "";
        pushToast(t("adminArticles.regenDone"), { tone: "success" });
        break;
      }
    }
  } catch (err: unknown) {
    pushToast(apiErrorMessage(err, t("adminArticles.regenFailed")), {
      tone: "danger",
    });
  } finally {
    busy.value = null;
  }
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
          <NuxtLink to="/admin/articles/pending" class="hover:text-slate-800">{{
            $t("adminArticles.breadcrumb")
          }}</NuxtLink>
          <span>/</span>
          <span>{{ $t("adminArticles.review") }}</span>
        </div>
        <h1 class="text-lg font-semibold text-slate-900">
          {{ $t("adminArticles.detailTitle") }}
        </h1>
        <p v-if="data" class="text-xs text-slate-500">
          {{ statusLabel(data.status) }} · {{ data.sourceName }}
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="text-xs px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50"
          :disabled="!!busy || !canMutate"
          @click="saveEdits"
        >
          {{ $t("adminArticles.save") }}
        </button>
        <button
          type="button"
          class="text-xs px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50"
          :disabled="!!busy || !canMutate"
          @click="regenerate"
        >
          {{ $t("adminArticles.regenerate") }}
        </button>
        <button
          type="button"
          class="text-xs px-3 py-1.5 rounded-md border border-rose-200 text-rose-700 bg-white hover:bg-rose-50 disabled:opacity-50"
          :disabled="!!busy || !canMutate"
          @click="reject(false)"
        >
          {{ $t("adminArticles.reject") }}
        </button>
        <button
          type="button"
          class="text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
          :disabled="!!busy || !canMutate"
          @click="approve"
        >
          {{ $t("adminArticles.approvePublish") }}
        </button>
      </div>
    </header>

    <div class="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
      <p
        v-if="loadError"
        class="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-md px-3 py-2"
      >
        {{ $t("adminArticles.loadFailed") }}
      </p>
      <p v-else-if="loading" class="text-xs text-slate-500">
        {{ $t("admin.loading") }}
      </p>

      <template v-else-if="data">
        <div
          class="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap gap-4 items-end"
        >
          <label
            class="flex flex-col gap-1 text-xs text-slate-600 flex-1 min-w-[12rem]"
          >
            <span>{{ $t("adminArticles.colCategory") }}</span>
            <select
              v-model="categoryId"
              class="border border-slate-300 rounded-md px-2 py-1.5 bg-white"
              :disabled="!canMutate"
            >
              <option value="">{{ $t("adminArticles.uncategorized") }}</option>
              <option
                v-for="cat in pipelineCategories"
                :key="cat.id"
                :value="cat.id"
              >
                {{ categoryOptionLabel(cat) }}
              </option>
            </select>
          </label>
          <a
            :href="data.originalUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="text-xs text-sky-700 hover:underline"
          >
            {{ $t("adminArticles.openSource") }}
          </a>
          <button
            v-if="canMutate"
            type="button"
            class="text-xs text-rose-600 hover:underline"
            :disabled="!!busy"
            @click="reject(true)"
          >
            {{ $t("adminArticles.deleteForever") }}
          </button>
        </div>

        <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 min-h-[28rem]">
          <section
            class="bg-white border border-slate-200 rounded-xl p-4 flex flex-col min-h-[24rem]"
          >
            <h2 class="text-sm font-semibold text-slate-800 mb-2">
              {{ $t("adminArticles.originalPanel") }}
            </h2>
            <p class="text-base font-medium text-slate-900 mb-3">
              {{ data.originalTitle }}
            </p>
            <div
              class="flex-1 overflow-y-auto text-sm text-slate-700 whitespace-pre-wrap leading-relaxed border border-slate-100 rounded-lg p-3 bg-slate-50"
            >
              {{ data.rawContent }}
            </div>
          </section>

          <section
            class="bg-white border border-slate-200 rounded-xl p-4 flex flex-col min-h-[24rem] gap-3"
          >
            <div class="flex items-center justify-between gap-2">
              <h2 class="text-sm font-semibold text-slate-800">
                {{ $t("adminArticles.rewritePanel") }}
              </h2>
              <label class="text-xs text-slate-500 flex items-center gap-1.5">
                <input v-model="showPreview" type="checkbox" />
                {{ $t("adminArticles.showPreview") }}
              </label>
            </div>
            <label class="flex flex-col gap-1 text-xs text-slate-600">
              <span>{{ $t("adminArticles.rewrittenTitle") }}</span>
              <input
                v-model="rewrittenTitle"
                type="text"
                maxlength="160"
                class="border border-slate-300 rounded-md px-2 py-1.5 text-sm"
                :disabled="!canMutate"
              />
            </label>
            <label class="flex flex-col gap-1 text-xs text-slate-600 flex-1">
              <span>{{ $t("adminArticles.rewrittenBody") }}</span>
              <textarea
                v-model="rewrittenContent"
                class="flex-1 min-h-[16rem] border border-slate-300 rounded-md px-3 py-2 text-sm font-mono leading-relaxed"
                :disabled="!canMutate"
              />
            </label>
            <div
              v-if="showPreview"
              class="border border-slate-100 rounded-lg p-3 bg-slate-50 max-h-64 overflow-y-auto prose prose-sm max-w-none"
              v-html="previewHtml"
            />
          </section>
        </div>
      </template>
    </div>
  </div>
</template>
