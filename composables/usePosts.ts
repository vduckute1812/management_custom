import type {
  FeedPage,
  Post,
  PostComment,
  PostFontFamily,
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
    () => null
  );

  async function refresh() {
    loading.value = true;
    error.value = null;
    try {
      const page = await apiFetch<FeedPage>("/api/posts", {
        query: {
          limit: 20,
          ...(categoryFilter.value
            ? { categoryId: categoryFilter.value }
            : {}),
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
      const page = await apiFetch<FeedPage>("/api/posts", {
        query: {
          limit: 20,
          cursor: nextCursor.value,
          ...(categoryFilter.value
            ? { categoryId: categoryFilter.value }
            : {}),
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
    visibility?: PostVisibility;
    audienceUserIds?: string[];
    attachmentIds?: string[];
    categoryId?: string | null;
    fontFamily?: PostFontFamily;
    textColor?: PostTextColor;
  }): Promise<Post> {
    const res = await apiFetch<{ post: Post }>("/api/posts", {
      method: "POST",
      body: {
        body: args.body,
        visibility: args.visibility ?? "public",
        audienceUserIds: args.audienceUserIds ?? [],
        attachmentIds: args.attachmentIds ?? [],
        categoryId: args.categoryId ?? null,
        fontFamily: args.fontFamily ?? "default",
        textColor: args.textColor ?? "default",
      },
    });
    // Only prepend if it matches the active category filter (or no filter).
    if (
      !categoryFilter.value ||
      res.post.category?.id === categoryFilter.value
    ) {
      posts.value = [res.post, ...posts.value];
    }
    pushToast(t("toasts.postShared"), { tone: "success", duration: 2500 });
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

  async function setReaction(id: string, reaction: PostReactionType) {
    const idx = posts.value.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const prev = posts.value[idx];
    const reactions = { ...(prev.reactions ?? emptyReactions()) };
    if (prev.myReaction) {
      reactions[prev.myReaction] = Math.max(0, reactions[prev.myReaction] - 1);
    }
    reactions[reaction] = (reactions[reaction] ?? 0) + 1;
    const reactionCount = POST_REACTION_TYPES.reduce(
      (sum, k) => sum + (reactions[k] ?? 0),
      0
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
      const res = await apiFetch<{ post: Post }>(`/api/posts/${id}/reactions`, {
        method: "POST",
        body: { reaction },
      });
      posts.value = patchPost(posts.value, id, res.post);
    } catch {
      posts.value = patchPost(posts.value, id, prev);
      pushToast(t("toasts.couldNotUpdateReaction"), { tone: "danger" });
    }
  }

  async function clearReaction(id: string) {
    const idx = posts.value.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const prev = posts.value[idx];
    if (!prev.myReaction) return;
    const reactions = { ...(prev.reactions ?? emptyReactions()) };
    reactions[prev.myReaction] = Math.max(0, reactions[prev.myReaction] - 1);
    const reactionCount = POST_REACTION_TYPES.reduce(
      (sum, k) => sum + (reactions[k] ?? 0),
      0
    );
    const optimistic: Post = {
      ...prev,
      reactions,
      reactionCount,
      myReaction: null,
      likedByMe: false,
      likeCount: reactions.like,
    };
    posts.value = patchPost(posts.value, id, optimistic);
    try {
      const res = await apiFetch<{ post: Post }>(`/api/posts/${id}/reactions`, {
        method: "DELETE",
      });
      posts.value = patchPost(posts.value, id, res.post);
    } catch {
      posts.value = patchPost(posts.value, id, prev);
      pushToast(t("toasts.couldNotClearReaction"), { tone: "danger" });
    }
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
    visibility: PostVisibility = "public"
  ): Promise<Post> {
    const res = await apiFetch<{ post: Post }>(`/api/posts/${id}/share`, {
      method: "POST",
      body: { body: note ?? "", visibility },
    });
    posts.value = [res.post, ...posts.value];
    pushToast(t("toasts.postSharedToFeed"), { tone: "success", duration: 2500 });
    return res.post;
  }

  async function loadComments(postId: string): Promise<PostComment[]> {
    const res = await apiFetch<{ comments: PostComment[] }>(
      `/api/posts/${postId}/comments`
    );
    return res.comments;
  }

  async function addComment(
    postId: string,
    body: string
  ): Promise<PostComment> {
    const res = await apiFetch<{ comment: PostComment }>(
      `/api/posts/${postId}/comments`,
      { method: "POST", body: { body } }
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
