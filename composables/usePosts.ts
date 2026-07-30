import type {
  FeedBootstrap,
  FeedPage,
  Post,
  PostAuthor,
  PostCategory,
  PostComment,
  PostFontFamily,
  PostFormat,
  PostReactionType,
  PostTextColor,
  PostVisibility,
} from "~/types/post";
import { POST_REACTION_TYPES } from "~/types/post";
import type { StoriesTray } from "~/types/story";

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
/** Ignores overlapping refresh results so rapid category switches stay consistent. */
let feedRefreshGeneration = 0;

export const usePosts = () => {
  // Bind locale in setup — calling useI18n() again from click handlers throws
  // in production (MUST_BE_CALL_SETUP_TOP → "Could not load the feed").
  const { t, locale } = useI18n();
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

  // Same useState keys as useCategories / useStories so one bootstrap call
  // can hydrate the whole Feed page without separate GETs.
  const categories = useState<PostCategory[]>("feed:categories", () => []);
  const storiesTray = useState<StoriesTray>("feed:storiesTray", () => ({
    groups: [],
  }));
  const categoriesLoading = useState<boolean>(
    "feed:categoriesLoading",
    () => false,
  );
  const storiesLoading = useState<boolean>("feed:storiesLoading", () => false);

  function feedListQuery(extra: { cursor?: string } = {}) {
    return {
      limit: 20,
      locale: locale.value,
      ...(categoryFilter.value ? { categoryId: categoryFilter.value } : {}),
      ...extra,
    };
  }

  function applyBootstrap(data: FeedBootstrap) {
    posts.value = data.posts;
    nextCursor.value = data.nextCursor;
    categories.value = data.categories;
    if (data.stories) {
      storiesTray.value = data.stories;
    }
  }

  /**
   * First-paint / post-auth Feed load: categories + posts (+ stories when
   * signed in) via `GET /api/feed` — one round-trip instead of 2–3.
   */
  async function bootstrap() {
    const generation = ++feedRefreshGeneration;
    loading.value = true;
    categoriesLoading.value = true;
    storiesLoading.value = true;
    error.value = null;
    try {
      const data = await apiFetch<FeedBootstrap>("/api/feed", {
        query: feedListQuery(),
      });
      if (generation !== feedRefreshGeneration) return;
      applyBootstrap(data);
    } catch (err: unknown) {
      if (generation !== feedRefreshGeneration) return;
      const msg =
        (err as { statusMessage?: string })?.statusMessage ||
        t("toasts.couldNotLoadFeed");
      error.value = msg;
      throw err;
    } finally {
      if (generation === feedRefreshGeneration) {
        loading.value = false;
        categoriesLoading.value = false;
        storiesLoading.value = false;
      }
    }
  }

  async function refresh() {
    const generation = ++feedRefreshGeneration;
    loading.value = true;
    error.value = null;
    try {
      const page = await apiFetch<FeedPage>("/api/posts", {
        query: feedListQuery(),
      });
      if (generation !== feedRefreshGeneration) return;
      posts.value = page.posts;
      nextCursor.value = page.nextCursor;
    } catch (err: unknown) {
      if (generation !== feedRefreshGeneration) return;
      const msg =
        (err as { statusMessage?: string })?.statusMessage ||
        t("toasts.couldNotLoadFeed");
      error.value = msg;
      throw err;
    } finally {
      if (generation === feedRefreshGeneration) {
        loading.value = false;
      }
    }
  }

  async function setCategoryFilter(id: string | null) {
    categoryFilter.value = id;
    await refresh();
  }

  async function loadMore() {
    if (!nextCursor.value || loadingMore.value || loading.value) return;
    loadingMore.value = true;
    try {
      const page = await apiFetch<FeedPage>("/api/posts", {
        query: feedListQuery({ cursor: nextCursor.value }),
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

  async function getPostForEdit(
    id: string,
  ): Promise<{ post: Post; audience: PostAuthor[] }> {
    const res = await apiFetch<{ post: Post; audience?: PostAuthor[] }>(
      `/api/posts/${id}`,
    );
    if (!res.post.canEdit) {
      const err = new Error("You cannot edit this post") as Error & {
        statusCode: number;
        statusMessage: string;
      };
      err.statusCode = 403;
      err.statusMessage = "You cannot edit this post";
      throw err;
    }
    return { post: res.post, audience: res.audience ?? [] };
  }

  async function updatePost(
    id: string,
    args: {
      body: string;
      title?: string | null;
      visibility?: PostVisibility;
      audienceUserIds?: string[];
      attachmentIds?: string[];
      categoryId?: string | null;
      fontFamily?: PostFontFamily;
      textColor?: PostTextColor;
    },
  ): Promise<Post> {
    try {
      const res = await apiFetch<{ post: Post }>(`/api/posts/${id}`, {
        method: "PATCH",
        body: {
          body: args.body,
          title: args.title ?? null,
          visibility: args.visibility ?? "public",
          audienceUserIds: args.audienceUserIds ?? [],
          attachmentIds: args.attachmentIds ?? [],
          categoryId: args.categoryId ?? null,
          fontFamily: args.fontFamily ?? "default",
          textColor: args.textColor ?? "default",
        },
      });
      posts.value = patchPost(posts.value, id, res.post);
      // If the post no longer matches the active category filter, drop it.
      if (
        categoryFilter.value &&
        res.post.category?.id !== categoryFilter.value
      ) {
        posts.value = posts.value.filter((p) => p.id !== id);
      }
      pushToast(t("toasts.postUpdated"), { tone: "success", duration: 2500 });
      return res.post;
    } catch (err) {
      pushToast(t("toasts.couldNotUpdatePost"), { tone: "danger" });
      throw err;
    }
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
    bootstrap,
    refresh,
    loadMore,
    createPost,
    getPost,
    getPostForEdit,
    updatePost,
    removePost,
    setReaction,
    clearReaction,
    sharePost,
    loadComments,
    addComment,
    removeComment,
  };
};
