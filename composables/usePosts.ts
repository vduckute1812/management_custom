import type {
  FeedPage,
  Post,
  PostComment,
  PostFontFamily,
  PostFormat,
  PostReactionType,
  PostTextColor,
  PostVisibility,
} from "~/types/post";
import { POST_REACTION_TYPES } from "~/types/post";

function emptyReactions(): Record<PostReactionType, number> {
  return {
    like: 0,
    love: 0,
    haha: 0,
    wow: 0,
    sad: 0,
    angry: 0,
  };
}

function patchPost(list: Post[], id: string, next: Post): Post[] {
  const idx = list.findIndex((p) => p.id === id);
  if (idx < 0) return list;
  return [...list.slice(0, idx), next, ...list.slice(idx + 1)];
}

/**
 * Monotonic token per post for reaction mutations. Rapid clicks fire
 * overlapping requests; only the response (or rollback) belonging to the
 * newest request may touch state, so out-of-order responses can never
 * overwrite fresher optimistic UI or corrupt counts.
 */
const reactionRequestTokens = new Map<string, number>();

export const usePosts = () => {
  const { t } = useI18n();
  const { apiFetch } = useApi();
  const { pushToast } = useToasts();

  const posts = useState<Post[]>("feed:posts", () => []);
  const nextCursor = useState<string | null>("feed:nextCursor", () => null);
  const loading = useState<boolean>("feed:loading", () => false);
  const loadingMore = useState<boolean>("feed:loadingMore", () => false);
  const error = useState<string | null>("feed:error", () => null);
  const categoryFilter = useState<string | null>(
    "feed:categoryFilter",
    () => null,
  );

  async function refresh() {
    loading.value = true;
    error.value = null;
    try {
      const { locale } = useI18n();
      const page = await apiFetch<FeedPage>("/api/posts", {
        query: {
          limit: 20,
          locale: locale.value,
          ...(categoryFilter.value ? { categoryId: categoryFilter.value } : {}),
        },
      });
      posts.value = page.posts;
      nextCursor.value = page.nextCursor;
    } catch (err: unknown) {
      const msg =
        (err as { statusMessage?: string })?.statusMessage ||
        t("toasts.couldNotLoadFeed");
      error.value = msg;
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function setCategoryFilter(id: string | null) {
    categoryFilter.value = id;
    await refresh();
  }

  async function loadMore() {
    if (!nextCursor.value || loadingMore.value) return;
    loadingMore.value = true;
    try {
      const { locale } = useI18n();
      const page = await apiFetch<FeedPage>("/api/posts", {
        query: {
          limit: 20,
          cursor: nextCursor.value,
          locale: locale.value,
          ...(categoryFilter.value ? { categoryId: categoryFilter.value } : {}),
        },
      });
      const seen = new Set(posts.value.map((p) => p.id));
      posts.value = [
        ...posts.value,
        ...page.posts.filter((p) => !seen.has(p.id)),
      ];
      nextCursor.value = page.nextCursor;
    } finally {
      loadingMore.value = false;
    }
  }

  async function createPost(args: {
    body: string;
    title?: string | null;
    format?: PostFormat;
    visibility?: PostVisibility;
    audienceUserIds?: string[];
    attachmentIds?: string[];
    categoryId?: string | null;
    fontFamily?: PostFontFamily;
    textColor?: PostTextColor;
    contentLocale?: string | null;
    translationGroupId?: string | null;
  }): Promise<Post> {
    const format = args.format ?? "update";
    const res = await apiFetch<{ post: Post }>("/api/posts", {
      method: "POST",
      body: {
        body: args.body,
        title: args.title ?? null,
        format,
        visibility: args.visibility ?? "public",
        audienceUserIds: args.audienceUserIds ?? [],
        attachmentIds: args.attachmentIds ?? [],
        categoryId: args.categoryId ?? null,
        fontFamily: args.fontFamily ?? "default",
        textColor: args.textColor ?? "default",
        contentLocale: args.contentLocale ?? null,
        translationGroupId: args.translationGroupId ?? null,
      },
    });
    // Only prepend if it matches the active category filter (or no filter).
    if (
      !categoryFilter.value ||
      res.post.category?.id === categoryFilter.value
    ) {
      posts.value = [res.post, ...posts.value];
    }
    pushToast(
      format === "manuscript"
        ? t("toasts.manuscriptPublished")
        : t("toasts.postShared"),
      { tone: "success", duration: 2500 },
    );
    return res.post;
  }

  async function getPost(id: string): Promise<Post> {
    const res = await apiFetch<{ post: Post }>(`/api/posts/${id}`);
    return res.post;
  }

  async function removePost(id: string) {
    const snapshot = posts.value;
    posts.value = posts.value.filter((p) => p.id !== id);
    try {
      await apiFetch(`/api/posts/${id}`, { method: "DELETE" });
      pushToast(t("toasts.postDeleted"), {
        tone: "info",
        duration: 4000,
        onAction: async () => {
          await refresh();
        },
        actionLabel: t("toasts.reload"),
      });
    } catch (err) {
      posts.value = snapshot;
      pushToast(t("toasts.couldNotDeletePost"), { tone: "danger" });
      throw err;
    }
  }

  /**
   * Optimistically apply a reaction (or clear it when `reaction` is null),
   * then reconcile with the server. Guarded by a per-post request token so
   * click spamming cannot interleave responses and corrupt counts.
   */
  async function mutateReaction(id: string, reaction: PostReactionType | null) {
    const idx = posts.value.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const prev = posts.value[idx];
    if (reaction === null && !prev.myReaction) return;
    if (reaction !== null && prev.myReaction === reaction) return;

    const token = (reactionRequestTokens.get(id) ?? 0) + 1;
    reactionRequestTokens.set(id, token);
    const isLatest = () => reactionRequestTokens.get(id) === token;

    const reactions = { ...(prev.reactions ?? emptyReactions()) };
    if (prev.myReaction) {
      reactions[prev.myReaction] = Math.max(0, reactions[prev.myReaction] - 1);
    }
    if (reaction) {
      reactions[reaction] = (reactions[reaction] ?? 0) + 1;
    }
    const reactionCount = POST_REACTION_TYPES.reduce(
      (sum, k) => sum + (reactions[k] ?? 0),
      0,
    );
    const optimistic: Post = {
      ...prev,
      reactions,
      reactionCount,
      myReaction: reaction,
      likedByMe: reaction === "like",
      likeCount: reactions.like,
    };
    posts.value = patchPost(posts.value, id, optimistic);

    try {
      const res = reaction
        ? await apiFetch<{ post: Post }>(`/api/posts/${id}/reactions`, {
            method: "POST",
            body: { reaction },
          })
        : await apiFetch<{ post: Post }>(`/api/posts/${id}/reactions`, {
            method: "DELETE",
          });
      // A newer click superseded this request — let its response win.
      if (isLatest()) {
        posts.value = patchPost(posts.value, id, res.post);
      }
    } catch {
      if (isLatest()) {
        posts.value = patchPost(posts.value, id, prev);
        pushToast(
          t(
            reaction
              ? "toasts.couldNotUpdateReaction"
              : "toasts.couldNotClearReaction",
          ),
          { tone: "danger" },
        );
      }
    }
  }

  async function setReaction(id: string, reaction: PostReactionType) {
    await mutateReaction(id, reaction);
  }

  async function clearReaction(id: string) {
    await mutateReaction(id, null);
  }

  async function toggleLike(id: string) {
    const post = posts.value.find((p) => p.id === id);
    if (!post) return;
    if (post.myReaction === "like") {
      await clearReaction(id);
    } else {
      await setReaction(id, "like");
    }
  }

  async function sharePost(
    id: string,
    note?: string,
    visibility: PostVisibility = "public",
  ): Promise<Post> {
    const res = await apiFetch<{ post: Post }>(`/api/posts/${id}/share`, {
      method: "POST",
      body: { body: note ?? "", visibility },
    });
    posts.value = [res.post, ...posts.value];
    pushToast(t("toasts.postSharedToFeed"), {
      tone: "success",
      duration: 2500,
    });
    return res.post;
  }

  async function loadComments(postId: string): Promise<PostComment[]> {
    const res = await apiFetch<{ comments: PostComment[] }>(
      `/api/posts/${postId}/comments`,
    );
    return res.comments;
  }

  async function addComment(
    postId: string,
    body: string,
  ): Promise<PostComment> {
    const res = await apiFetch<{ comment: PostComment }>(
      `/api/posts/${postId}/comments`,
      { method: "POST", body: { body } },
    );
    const current = posts.value.find((p) => p.id === postId);
    if (current) {
      posts.value = patchPost(posts.value, postId, {
        ...current,
        commentCount: current.commentCount + 1,
      });
    }
    return res.comment;
  }

  async function removeComment(postId: string, commentId: string) {
    await apiFetch(`/api/posts/${postId}/comments/${commentId}`, {
      method: "DELETE",
    });
    const current = posts.value.find((p) => p.id === postId);
    if (current) {
      posts.value = patchPost(posts.value, postId, {
        ...current,
        commentCount: Math.max(0, current.commentCount - 1),
      });
    }
  }

  return {
    posts,
    nextCursor,
    loading,
    loadingMore,
    error,
    categoryFilter,
    setCategoryFilter,
    refresh,
    loadMore,
    createPost,
    getPost,
    removePost,
    toggleLike,
    setReaction,
    clearReaction,
    sharePost,
    loadComments,
    addComment,
    removeComment,
  };
};
