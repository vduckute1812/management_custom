<script setup lang="ts">
import {
  ArticleStatus,
  ARTICLE_STATUS_I18N_KEYS,
  PIPELINE_CATEGORY_SLUGS,
  type PendingArticle,
} from "~/types/article";
import type { PostCategory } from "~/types/post";
import { categoryDisplayName } from "~/utils/categoryLabel";
import { apiErrorMessage } from "~/utils/apiErrorMessage";
import { renderPostBody } from "~/utils/renderPostBody";
import { isSafeHttpUrl } from "~/utils/articleUrl";

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
const confirmAction = ref<"approve" | "reject" | "delete" | null>(null);
const pollStop = ref(false);
/** Avoid clobbering in-progress edits when a poll refresh returns the same row. */
const editorSeededForId = ref<string | null>(null);

watch(
  data,
  (article) => {
    if (!article) return;
    categoryId.value = article.categoryId || "";
    const sameRow = editorSeededForId.value === article.id;
    const serverRewrite = (article.rewrittenContent || "").trim();
    const serverTitle = (article.rewrittenTitle || "").trim();
    // Re-seed when opening a new article, or when AI rewrite just arrived.
    if (
      !sameRow ||
      (serverRewrite && serverRewrite !== rewrittenContent.value)
    ) {
      rewrittenTitle.value = serverTitle || article.originalTitle || "";
      rewrittenContent.value = serverRewrite || article.rawContent || "";
      editorSeededForId.value = article.id;
    }
  },
  { immediate: true },
);

let previewTimer: ReturnType<typeof setTimeout> | null = null;
watch(rewrittenContent, (body) => {
  if (!showPreview.value) return;
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = setTimeout(async () => {
    previewHtml.value = body ? await renderPostBody(body) : "";
  }, 400);
});

watch(showPreview, async (on) => {
  if (on && rewrittenContent.value) {
    previewHtml.value = await renderPostBody(rewrittenContent.value);
  }
});

onBeforeUnmount(() => {
  pollStop.value = true;
  if (previewTimer) clearTimeout(previewTimer);
});

const pipelineCategories = computed(() =>
  (categories.value || []).filter((c) =>
    (PIPELINE_CATEGORY_SLUGS as readonly string[]).includes(c.slug),
  ),
);

const canEdit = computed(() => {
  const s = data.value?.status;
  return (
    s === ArticleStatus.Draft ||
    s === ArticleStatus.PendingApproval ||
    s === ArticleStatus.Rejected
  );
});

/** Hard-delete is allowed for every pipeline status, including Approved. */
const canDelete = computed(() => !!data.value);

const hasPublishableContent = computed(() => {
  return (
    rewrittenTitle.value.trim().length > 0 &&
    rewrittenContent.value.trim().length > 0
  );
});

const canApprove = computed(() => {
  const s = data.value?.status;
  if (s !== ArticleStatus.Draft && s !== ArticleStatus.PendingApproval) {
    return false;
  }
  return hasPublishableContent.value;
});

const isDraftWithoutAi = computed(() => {
  const a = data.value;
  if (!a || a.status !== ArticleStatus.Draft) return false;
  return !(a.rewrittenContent || "").trim();
});

const safeSourceUrl = computed(() => {
  const url = data.value?.originalUrl;
  return url && isSafeHttpUrl(url) ? url : null;
});

function statusLabel(status: number): string {
  const key =
    ARTICLE_STATUS_I18N_KEYS[status as keyof typeof ARTICLE_STATUS_I18N_KEYS];
  return key ? t(key) : String(status);
}

function categoryOptionLabel(cat: PostCategory): string {
  return categoryDisplayName(cat, t, te);
}

function useOriginalInEditor() {
  if (!data.value || !canEdit.value) return;
  rewrittenTitle.value = data.value.originalTitle || rewrittenTitle.value;
  rewrittenContent.value = data.value.rawContent || "";
}

async function saveEdits() {
  if (!canEdit.value) return;
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
  if (!canApprove.value) return;
  busy.value = "approve";
  confirmAction.value = null;
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
  if (deleteRow) {
    if (!canDelete.value) return;
  } else if (!canEdit.value) {
    return;
  }
  busy.value = deleteRow ? "delete" : "reject";
  confirmAction.value = null;
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
    pushToast(
      apiErrorMessage(
        err,
        deleteRow
          ? t("adminArticles.deleteFailed")
          : t("adminArticles.rejectFailed"),
      ),
      { tone: "danger" },
    );
  } finally {
    busy.value = null;
  }
}

async function regenerate() {
  if (!canEdit.value) return;
  busy.value = "regen";
  pollStop.value = false;
  try {
    const res = await apiFetch<{ ok: true; article: PendingArticle }>(
      `/api/admin/articles/pending/${id.value}/regenerate`,
      { method: "POST" },
    );
    data.value = res.article;
    pushToast(t("adminArticles.regenQueued"), { tone: "success" });
    let finished = false;
    for (let i = 0; i < 16; i++) {
      if (pollStop.value) break;
      await new Promise((r) => setTimeout(r, 2500));
      if (pollStop.value) break;
      await refresh();
      if (data.value?.status === ArticleStatus.PendingApproval) {
        rewrittenTitle.value = data.value.rewrittenTitle || "";
        rewrittenContent.value = data.value.rewrittenContent || "";
        pushToast(t("adminArticles.regenDone"), { tone: "success" });
        finished = true;
        break;
      }
    }
    if (!finished && !pollStop.value) {
      pushToast(t("adminArticles.regenStillRunning"), { tone: "info" });
    }
  } catch (err: unknown) {
    pushToast(apiErrorMessage(err, t("adminArticles.regenFailed")), {
      tone: "danger",
    });
  } finally {
    busy.value = null;
  }
}

function onConfirm() {
  if (confirmAction.value === "approve") void approve();
  else if (confirmAction.value === "reject") void reject(false);
  else if (confirmAction.value === "delete") void reject(true);
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
      <div class="flex flex-wrap items-center gap-2" :aria-busy="!!busy">
        <button
          type="button"
          class="text-xs px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50"
          :disabled="!!busy || !canEdit"
          @click="saveEdits"
        >
          {{ busy === "save" ? $t("common.saving") : $t("adminArticles.save") }}
        </button>
        <button
          type="button"
          class="text-xs px-3 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50"
          :disabled="!!busy || !canEdit"
          @click="regenerate"
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
          @click="confirmAction = 'reject'"
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
          @click="confirmAction = 'approve'"
        >
          {{
            busy === "approve"
              ? $t("adminArticles.approving")
              : $t("adminArticles.approvePublish")
          }}
        </button>
      </div>
    </header>

    <div
      class="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 space-y-4 pb-24 md:pb-6"
    >
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
        <p
          v-if="isDraftWithoutAi"
          class="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2"
        >
          {{ $t("adminArticles.draftNoRewriteHint") }}
        </p>

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
              :disabled="!canEdit"
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
            v-if="safeSourceUrl"
            :href="safeSourceUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="text-xs text-sky-700 hover:underline"
          >
            {{ $t("adminArticles.openSource") }}
          </a>
          <span v-else class="text-xs text-slate-400">{{
            $t("adminArticles.unsafeSourceUrl")
          }}</span>
          <button
            v-if="canEdit"
            type="button"
            class="text-xs text-slate-600 hover:underline"
            :disabled="!!busy"
            @click="useOriginalInEditor"
          >
            {{ $t("adminArticles.useOriginal") }}
          </button>
          <button
            v-if="canDelete"
            type="button"
            class="text-xs text-rose-600 hover:underline"
            :disabled="!!busy"
            @click="confirmAction = 'delete'"
          >
            {{ $t("adminArticles.deleteForever") }}
          </button>
        </div>

        <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <section
            class="bg-white border border-slate-200 rounded-xl p-4 flex flex-col h-[min(70vh,36rem)]"
          >
            <h2 class="text-sm font-semibold text-slate-800 mb-2 shrink-0">
              {{ $t("adminArticles.originalPanel") }}
            </h2>
            <p class="text-base font-medium text-slate-900 mb-3 shrink-0">
              {{ data.originalTitle }}
            </p>
            <div
              class="flex-1 min-h-0 overflow-y-auto text-sm text-slate-700 whitespace-pre-wrap leading-relaxed border border-slate-100 rounded-lg p-3 bg-slate-50"
            >
              <p
                v-if="!(data.rawContent || '').trim()"
                class="text-slate-400 italic"
              >
                {{ $t("adminArticles.noOriginalBody") }}
              </p>
              <template v-else>{{ data.rawContent }}</template>
            </div>
          </section>

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
            <label
              class="flex flex-col gap-1 text-xs text-slate-600 flex-1 min-h-0"
            >
              <span class="shrink-0">{{
                $t("adminArticles.rewrittenBody")
              }}</span>
              <textarea
                v-model="rewrittenContent"
                class="flex-1 min-h-0 w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono leading-relaxed resize-none"
                :disabled="!canEdit"
                :placeholder="$t('adminArticles.rewritePlaceholder')"
              />
            </label>
            <div
              v-if="showPreview"
              class="border border-slate-100 rounded-lg p-3 bg-slate-50 max-h-40 overflow-y-auto prose prose-sm max-w-none shrink-0"
              aria-live="polite"
              v-html="previewHtml"
            />
          </section>
        </div>
      </template>
    </div>

    <ConfirmDialog
      :open="confirmAction === 'approve'"
      :title="$t('adminArticles.approveConfirmTitle')"
      :description="$t('adminArticles.approveConfirm')"
      :busy="busy === 'approve'"
      :destructive="false"
      :confirm-label="$t('adminArticles.approvePublish')"
      @cancel="confirmAction = null"
      @confirm="onConfirm"
    />
    <ConfirmDialog
      :open="confirmAction === 'reject'"
      :title="$t('adminArticles.rejectConfirmTitle')"
      :description="$t('adminArticles.rejectConfirm')"
      :busy="busy === 'reject'"
      :confirm-label="$t('adminArticles.reject')"
      @cancel="confirmAction = null"
      @confirm="onConfirm"
    />
    <ConfirmDialog
      :open="confirmAction === 'delete'"
      :title="$t('adminArticles.deleteConfirmTitle')"
      :description="
        data?.status === ArticleStatus.Approved
          ? $t('adminArticles.deleteConfirmApproved')
          : $t('adminArticles.deleteConfirm')
      "
      :busy="busy === 'delete'"
      :confirm-label="$t('adminArticles.deleteForever')"
      @cancel="confirmAction = null"
      @confirm="onConfirm"
    />
  </div>
</template>
