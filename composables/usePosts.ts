import type { FeedPage, Post, PostComment } from "~/types/post";

export const usePosts = () => {
  const { apiFetch } = useApi();
  const { pushToast } = useToasts();

  const posts = useState<Post[]>("feed:posts", () => []);
  const nextCursor = useState<string | null>("feed:nextCursor", () => null);
  const loading = useState<boolean>("feed:loading", () => false);
  const loadingMore = useState<boolean>("feed:loadingMore", () => false);
  const error = useState<string | null>("feed:error", () => null);

  async function refresh() {
    loading.value = true;
    error.value = null;
    try {
      const page = await apiFetch<FeedPage>("/api/posts", {
        query: { limit: 20 },
      });
      posts.value = page.posts;
      nextCursor.value = page.nextCursor;
    } catch (err: unknown) {
      const msg =
        (err as { statusMessage?: string })?.statusMessage ||
        "Could not load the feed.";
      error.value = msg;
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function loadMore() {
    if (!nextCursor.value || loadingMore.value) return;
    loadingMore.value = true;
    try {
      const page = await apiFetch<FeedPage>("/api/posts", {
        query: { limit: 20, cursor: nextCursor.value },
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

  async function createPost(body: string): Promise<Post> {
    const res = await apiFetch<{ post: Post }>("/api/posts", {
      method: "POST",
      body: { body },
    });
    posts.value = [res.post, ...posts.value];
    pushToast("Post shared", { tone: "success", duration: 2500 });
    return res.post;
  }

  async function removePost(id: string) {
    const snapshot = posts.value;
    posts.value = posts.value.filter((p) => p.id !== id);
    try {
      await apiFetch(`/api/posts/${id}`, { method: "DELETE" });
      pushToast("Post deleted", {
        tone: "info",
        duration: 4000,
        onAction: async () => {
          // Soft undo isn't supported server-side; just reload.
          await refresh();
        },
        actionLabel: "Reload",
      });
    } catch (err) {
      posts.value = snapshot;
      pushToast("Could not delete post", { tone: "danger" });
      throw err;
    }
  }

  async function toggleLike(id: string) {
    const idx = posts.value.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const prev = posts.value[idx];
    const optimistic: Post = {
      ...prev,
      likedByMe: !prev.likedByMe,
      likeCount: prev.likedByMe
        ? Math.max(0, prev.likeCount - 1)
        : prev.likeCount + 1,
    };
    posts.value = [
      ...posts.value.slice(0, idx),
      optimistic,
      ...posts.value.slice(idx + 1),
    ];
    try {
      const res = await apiFetch<{ liked: boolean; likeCount: number }>(
        `/api/posts/${id}/like`,
        { method: "POST" }
      );
      const current = posts.value.find((p) => p.id === id);
      if (!current) return;
      const nextIdx = posts.value.findIndex((p) => p.id === id);
      posts.value = [
        ...posts.value.slice(0, nextIdx),
        { ...current, likedByMe: res.liked, likeCount: res.likeCount },
        ...posts.value.slice(nextIdx + 1),
      ];
    } catch {
      posts.value = [
        ...posts.value.slice(0, idx),
        prev,
        ...posts.value.slice(idx + 1),
      ];
      pushToast("Could not update like", { tone: "danger" });
    }
  }

  async function sharePost(id: string, note?: string): Promise<Post> {
    const res = await apiFetch<{ post: Post }>(`/api/posts/${id}/share`, {
      method: "POST",
      body: { body: note ?? "" },
    });
    posts.value = [res.post, ...posts.value];
    pushToast("Post shared to your feed", { tone: "success", duration: 2500 });
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
    const idx = posts.value.findIndex((p) => p.id === postId);
    if (idx >= 0) {
      const current = posts.value[idx];
      posts.value = [
        ...posts.value.slice(0, idx),
        { ...current, commentCount: current.commentCount + 1 },
        ...posts.value.slice(idx + 1),
      ];
    }
    return res.comment;
  }

  async function removeComment(postId: string, commentId: string) {
    await apiFetch(`/api/posts/${postId}/comments/${commentId}`, {
      method: "DELETE",
    });
    const idx = posts.value.findIndex((p) => p.id === postId);
    if (idx >= 0) {
      const current = posts.value[idx];
      posts.value = [
        ...posts.value.slice(0, idx),
        {
          ...current,
          commentCount: Math.max(0, current.commentCount - 1),
        },
        ...posts.value.slice(idx + 1),
      ];
    }
  }

  return {
    posts,
    nextCursor,
    loading,
    loadingMore,
    error,
    refresh,
    loadMore,
    createPost,
    removePost,
    toggleLike,
    sharePost,
    loadComments,
    addComment,
    removeComment,
  };
};
