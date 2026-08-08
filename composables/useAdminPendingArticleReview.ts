import {
  ArticleStatus,
  PIPELINE_CATEGORY_SLUGS,
  type PendingArticle,
} from "~/types/article";
import type { PostCategory } from "~/types/post";
import { categoryDisplayName } from "~/utils/categoryLabel";
import { apiErrorMessage } from "~/utils/apiErrorMessage";
import { renderPostBody } from "~/utils/renderPostBody";
import { isSafeHttpUrl } from "~/utils/articleUrl";

export async function useAdminPendingArticleReview() {
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
  const editorSeededForId = ref<string | null>(null);

  watch(
    data,
    (article) => {
      if (!article) return;
      categoryId.value = article.categoryId || "";
      const sameRow = editorSeededForId.value === article.id;
      const serverRewrite = (article.rewrittenContent || "").trim();
      const serverTitle = (article.rewrittenTitle || "").trim();
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

  return {
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
  };
}
