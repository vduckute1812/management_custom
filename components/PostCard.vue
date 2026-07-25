<script setup lang="ts">
import type { Post, PostComment } from "~/types/post";

const props = defineProps<{
  post: Post;
}>();

const emit = defineEmits<{
  (e: "like"): void;
  (e: "delete"): void;
  (e: "share", note: string): void;
}>();

const {
  loadComments,
  addComment,
  removeComment,
} = usePosts();

const commentsOpen = ref(false);
const comments = ref<PostComment[]>([]);
const commentsLoading = ref(false);
const commentBody = ref("");
const commentSubmitting = ref(false);
const shareOpen = ref(false);
const shareNote = ref("");
const shareSubmitting = ref(false);

function authorLabel(name: string | null, email: string) {
  return name?.trim() || email;
}

function initialOf(name: string | null, email: string) {
  return (name?.trim() || email).charAt(0).toUpperCase() || "?";
}

function formatWhen(iso: string) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const diffMs = Date.now() - d.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

async function toggleComments() {
  commentsOpen.value = !commentsOpen.value;
  if (commentsOpen.value && comments.value.length === 0) {
    commentsLoading.value = true;
    try {
      comments.value = await loadComments(props.post.id);
    } finally {
      commentsLoading.value = false;
    }
  }
}

async function onAddComment() {
  const text = commentBody.value.trim();
  if (!text || commentSubmitting.value) return;
  commentSubmitting.value = true;
  try {
    const created = await addComment(props.post.id, text);
    comments.value = [...comments.value, created];
    commentBody.value = "";
    commentsOpen.value = true;
  } finally {
    commentSubmitting.value = false;
  }
}

async function onDeleteComment(comment: PostComment) {
  await removeComment(props.post.id, comment.id);
  comments.value = comments.value.filter((c) => c.id !== comment.id);
}

function onShare() {
  if (shareSubmitting.value) return;
  shareSubmitting.value = true;
  try {
    emit("share", shareNote.value.trim());
    shareOpen.value = false;
    shareNote.value = "";
  } finally {
    shareSubmitting.value = false;
  }
}
</script>

<template>
  <article class="rounded-xl border border-slate-200 bg-white overflow-hidden">
    <header class="flex items-start gap-3 px-4 pt-4">
      <div
        class="w-10 h-10 rounded-full bg-brand-100 text-brand-700 text-sm font-semibold flex items-center justify-center shrink-0"
        aria-hidden="true"
      >
        {{ initialOf(post.author.name, post.author.email) }}
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-baseline gap-2 min-w-0">
          <p class="text-sm font-semibold text-slate-900 truncate">
            {{ authorLabel(post.author.name, post.author.email) }}
          </p>
          <time
            class="text-[11px] text-slate-400 tabular-nums shrink-0"
            :datetime="post.createdAt"
            :title="post.createdAt"
          >
            {{ formatWhen(post.createdAt) }}
          </time>
        </div>
        <p class="text-[11px] text-slate-400 truncate">
          {{ post.author.email }}
        </p>
      </div>
      <button
        v-if="post.canDelete"
        type="button"
        class="text-[11px] text-slate-400 hover:text-rose-600 px-1.5 py-1 rounded"
        title="Delete post"
        @click="emit('delete')"
      >
        Delete
      </button>
    </header>

    <div class="px-4 pt-3 pb-2 space-y-3">
      <p
        v-if="post.body"
        class="text-sm text-slate-800 whitespace-pre-wrap break-words"
      >
        {{ post.body }}
      </p>

      <div
        v-if="post.sharedPost"
        class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 space-y-1.5"
      >
        <p class="text-xs font-medium text-slate-600">
          {{
            authorLabel(
              post.sharedPost.author.name,
              post.sharedPost.author.email
            )
          }}
          <span class="font-normal text-slate-400">
            · {{ formatWhen(post.sharedPost.createdAt) }}
          </span>
        </p>
        <p class="text-sm text-slate-700 whitespace-pre-wrap break-words">
          {{ post.sharedPost.body }}
        </p>
      </div>
    </div>

    <div
      class="px-4 py-1.5 flex items-center justify-between text-[11px] text-slate-500 tabular-nums"
    >
      <span>{{ post.likeCount }} like{{ post.likeCount === 1 ? "" : "s" }}</span>
      <span>
        {{ post.commentCount }} comment{{ post.commentCount === 1 ? "" : "s" }}
      </span>
    </div>

    <div class="grid grid-cols-3 border-t border-slate-100">
      <button
        type="button"
        class="flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition"
        :class="
          post.likedByMe
            ? 'text-brand-700 bg-brand-50/40'
            : 'text-slate-600 hover:bg-slate-50'
        "
        :aria-pressed="post.likedByMe"
        @click="emit('like')"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          :fill="post.likedByMe ? 'currentColor' : 'none'"
          stroke="currentColor"
          stroke-width="2"
          class="w-4 h-4"
          aria-hidden="true"
        >
          <path
            d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14z"
            stroke-linejoin="round"
          />
          <path d="M7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3" />
        </svg>
        Like
      </button>
      <button
        type="button"
        class="flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
        @click="toggleComments"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="w-4 h-4"
          aria-hidden="true"
        >
          <path
            d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"
            stroke-linejoin="round"
          />
        </svg>
        Comment
      </button>
      <button
        type="button"
        class="flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
        @click="shareOpen = !shareOpen"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="w-4 h-4"
          aria-hidden="true"
        >
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" />
        </svg>
        Share
      </button>
    </div>

    <div
      v-if="shareOpen"
      class="border-t border-slate-100 px-4 py-3 space-y-2 bg-slate-50/60"
    >
      <label class="sr-only" :for="`share-${post.id}`">Share note</label>
      <input
        :id="`share-${post.id}`"
        v-model="shareNote"
        type="text"
        maxlength="5000"
        class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
        placeholder="Add a note (optional)"
        @keydown.enter.prevent="onShare"
      />
      <div class="flex justify-end gap-2">
        <button
          type="button"
          class="text-xs text-slate-500 px-2 py-1.5 rounded hover:bg-slate-100"
          @click="shareOpen = false"
        >
          Cancel
        </button>
        <button
          type="button"
          class="text-xs font-medium text-white bg-brand-600 hover:bg-brand-700 px-3 py-1.5 rounded-lg disabled:opacity-50"
          :disabled="shareSubmitting"
          @click="onShare"
        >
          Share now
        </button>
      </div>
    </div>

    <div v-if="commentsOpen" class="border-t border-slate-100 px-4 py-3 space-y-3">
      <div v-if="commentsLoading" class="text-xs text-slate-400 py-2">
        Loading comments…
      </div>
      <ul v-else class="space-y-3">
        <li
          v-for="comment in comments"
          :key="comment.id"
          class="flex gap-2.5"
        >
          <div
            class="w-7 h-7 rounded-full bg-slate-200 text-slate-600 text-[10px] font-semibold flex items-center justify-center shrink-0"
            aria-hidden="true"
          >
            {{ initialOf(comment.author.name, comment.author.email) }}
          </div>
          <div class="flex-1 min-w-0 rounded-lg bg-slate-50 px-3 py-2">
            <div class="flex items-baseline justify-between gap-2">
              <p class="text-xs font-semibold text-slate-800 truncate">
                {{ authorLabel(comment.author.name, comment.author.email) }}
              </p>
              <button
                v-if="comment.canDelete"
                type="button"
                class="text-[10px] text-slate-400 hover:text-rose-600"
                @click="onDeleteComment(comment)"
              >
                Delete
              </button>
            </div>
            <p class="text-sm text-slate-700 whitespace-pre-wrap break-words mt-0.5">
              {{ comment.body }}
            </p>
          </div>
        </li>
        <li v-if="!comments.length" class="text-xs text-slate-400 italic">
          No comments yet — be the first.
        </li>
      </ul>

      <form class="flex gap-2" @submit.prevent="onAddComment">
        <label class="sr-only" :for="`comment-${post.id}`">Write a comment</label>
        <input
          :id="`comment-${post.id}`"
          v-model="commentBody"
          type="text"
          maxlength="2000"
          class="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
          placeholder="Write a comment…"
          :disabled="commentSubmitting"
        />
        <button
          type="submit"
          class="rounded-lg bg-brand-600 px-3 py-2 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          :disabled="!commentBody.trim() || commentSubmitting"
        >
          Reply
        </button>
      </form>
    </div>
  </article>
</template>
