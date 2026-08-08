import type { Ref } from "vue";
import type { ApiFetchOptions } from "~/composables/shared/useApi";
import type { Toast } from "~/composables/app/useToasts";
import type { Post, PostComment, PostReactionType } from "~/types/post";
import { PostVisibility } from "~/types/post";
import { applyOptimisticReaction } from "~/utils/optimisticReaction";

interface PostApiFetch {
  <T = unknown>(url: string, options?: ApiFetchOptions): Promise<T>;
}

interface PostMutationDependencies {
  posts: Ref<Post[]>;
  apiFetch: PostApiFetch;
  pushToast: (
    message: string,
    options?: {
      tone?: "info" | "success" | "danger";
      duration?: number;
    },
  ) => Toast;
  t: (key: string) => string;
}

export function patchPost(list: Post[], id: string, next: Post): Post[] {
  const index = list.findIndex((post) => post.id === id);
  if (index < 0) return list;
  return [...list.slice(0, index), next, ...list.slice(index + 1)];
}

/**
 * Monotonic token per post. Only the latest overlapping reaction request may
 * reconcile or roll back optimistic state.
 */
const reactionRequestTokens = new Map<string, number>();

export function createPostMutations({
  posts,
  apiFetch,
  pushToast,
  t,
}: PostMutationDependencies) {
  async function mutateReaction(id: string, reaction: PostReactionType | null) {
    const index = posts.value.findIndex((post) => post.id === id);
    if (index < 0) return;
    const previous = posts.value[index];
    if (!previous) return;
    if (reaction === null && previous.myReaction == null) return;
    if (reaction !== null && previous.myReaction === reaction) return;

    const token = (reactionRequestTokens.get(id) ?? 0) + 1;
    reactionRequestTokens.set(id, token);
    const isLatest = () => reactionRequestTokens.get(id) === token;
    posts.value = patchPost(posts.value, id, {
      ...previous,
      ...applyOptimisticReaction(previous, reaction),
    });

    try {
      const response =
        reaction != null
          ? await apiFetch<{ post: Post }>(`/api/posts/${id}/reactions`, {
              method: "POST",
              body: { reaction },
            })
          : await apiFetch<{ post: Post }>(`/api/posts/${id}/reactions`, {
              method: "DELETE",
            });
      if (isLatest()) {
        posts.value = patchPost(posts.value, id, response.post);
      }
    } catch {
      if (isLatest()) {
        posts.value = patchPost(posts.value, id, previous);
        pushToast(
          t(
            reaction != null
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
    visibility: PostVisibility = PostVisibility.Public,
  ): Promise<Post> {
    const response = await apiFetch<{ post: Post }>(`/api/posts/${id}/share`, {
      method: "POST",
      body: { body: note ?? "", visibility },
    });
    posts.value = [response.post, ...posts.value];
    pushToast(t("toasts.postSharedToFeed"), {
      tone: "success",
      duration: 2500,
    });
    return response.post;
  }

  async function loadComments(
    postId: string,
    options: { limit?: number; before?: string | null } = {},
  ): Promise<{
    comments: PostComment[];
    hasMore: boolean;
    nextBefore: string | null;
  }> {
    return apiFetch<{
      comments: PostComment[];
      hasMore: boolean;
      nextBefore: string | null;
    }>(`/api/posts/${postId}/comments`, {
      query: {
        limit: options.limit ?? 30,
        ...(options.before ? { before: options.before } : {}),
      },
    });
  }

  async function addComment(
    postId: string,
    body: string,
  ): Promise<PostComment> {
    const response = await apiFetch<{ comment: PostComment }>(
      `/api/posts/${postId}/comments`,
      { method: "POST", body: { body } },
    );
    const current = posts.value.find((post) => post.id === postId);
    if (current) {
      posts.value = patchPost(posts.value, postId, {
        ...current,
        commentCount: current.commentCount + 1,
      });
    }
    return response.comment;
  }

  async function removeComment(postId: string, commentId: string) {
    await apiFetch(`/api/posts/${postId}/comments/${commentId}`, {
      method: "DELETE",
    });
    const current = posts.value.find((post) => post.id === postId);
    if (current) {
      posts.value = patchPost(posts.value, postId, {
        ...current,
        commentCount: Math.max(0, current.commentCount - 1),
      });
    }
  }

  return {
    setReaction,
    clearReaction,
    sharePost,
    loadComments,
    addComment,
    removeComment,
  };
}
