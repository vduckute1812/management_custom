<script setup lang="ts">
import type { PostComment } from "~/types/post";

const props = defineProps<{
  postId: string;
  open: boolean;
}>();

const { t } = useI18n();
const auth = useAuth();
const { loadComments, addComment, removeComment } = usePosts();

const comments = ref<PostComment[]>([]);
const commentsLoading = ref(false);
const commentBody = ref("");
const commentSubmitting = ref(false);
const loadedFor = ref<string | null>(null);
const pendingDelete = ref<PostComment | null>(null);
const deleteBusy = ref(false);

function authorLabel(name: string | null, email: string) {
  return name?.trim() || email;
}

function initialOf(name: string | null, email: string) {
  return (name?.trim() || email).charAt(0).toUpperCase() || "?";
}

async function loadIfNeeded() {
  if (!props.open) return;
  if (loadedFor.value === props.postId) return;
  commentsLoading.value = true;
  try {
    comments.value = await loadComments(props.postId);
    loadedFor.value = props.postId;
  } finally {
    commentsLoading.value = false;
  }
}

watch(
  () => [props.open, props.postId] as const,
  async ([open, id]) => {
    if (!open) return;
    if (loadedFor.value !== id) {
      comments.value = [];
      loadedFor.value = null;
    }
    await loadIfNeeded();
  },
  { immediate: true },
);

async function onAddComment() {
  const text = commentBody.value.trim();
  if (!text || commentSubmitting.value) return;
  commentSubmitting.value = true;
  try {
    const created = await addComment(props.postId, text);
    comments.value = [...comments.value, created];
    commentBody.value = "";
  } finally {
    commentSubmitting.value = false;
  }
}

function requestDeleteComment(comment: PostComment) {
  if (deleteBusy.value) return;
  pendingDelete.value = comment;
}

async function confirmDeleteComment() {
  const comment = pendingDelete.value;
  if (!comment || deleteBusy.value) return;
  deleteBusy.value = true;
  try {
    await removeComment(props.postId, comment.id);
    comments.value = comments.value.filter((c) => c.id !== comment.id);
    pendingDelete.value = null;
  } finally {
    deleteBusy.value = false;
  }
}
</script>

<template>
  <div v-if="open" class="space-y-3 border-t border-slate-100 px-4 py-3">
    <div v-if="commentsLoading" class="space-y-2" aria-busy="true">
      <SkeletonBlock height="h-10" rounded="rounded-lg" />
      <SkeletonBlock height="h-10" rounded="rounded-lg" />
    </div>
    <ul v-else class="space-y-3">
      <li v-for="comment in comments" :key="comment.id" class="flex gap-2.5">
        <div
          class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600"
          aria-hidden="true"
        >
          {{ initialOf(comment.author.name, comment.author.email) }}
        </div>
        <div class="min-w-0 flex-1 rounded-lg bg-slate-50 px-3 py-2">
          <div class="flex items-baseline justify-between gap-2">
            <p class="truncate text-xs font-semibold text-slate-800">
              {{ authorLabel(comment.author.name, comment.author.email) }}
            </p>
            <button
              v-if="comment.canDelete"
              type="button"
              class="text-[10px] text-slate-400 hover:text-rose-600"
              @click="requestDeleteComment(comment)"
            >
              {{ t("feed.post.delete") }}
            </button>
          </div>
          <p
            class="mt-0.5 break-words whitespace-pre-wrap text-sm text-slate-700"
          >
            {{ comment.body }}
          </p>
        </div>
      </li>
      <li v-if="!comments.length" class="text-xs italic text-slate-400">
        {{ t("feed.post.noCommentsYet") }}
      </li>
    </ul>

    <form
      v-if="auth.isAuthenticatedUi.value"
      class="flex gap-2"
      @submit.prevent="onAddComment"
    >
      <label class="sr-only" :for="`comment-${postId}`">{{
        t("feed.post.writeComment")
      }}</label>
      <input
        :id="`comment-${postId}`"
        v-model="commentBody"
        type="text"
        maxlength="2000"
        class="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
        :placeholder="t('feed.post.writeCommentPlaceholder')"
        :disabled="commentSubmitting"
      />
      <button
        type="submit"
        class="rounded-lg bg-brand-600 px-3 py-2 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        :disabled="!commentBody.trim() || commentSubmitting"
      >
        {{ t("feed.post.reply") }}
      </button>
    </form>
    <p v-else class="text-xs text-slate-500">
      <NuxtLink to="/login" class="font-medium text-brand-700 hover:underline">
        {{ t("feed.post.loginLink") }} </NuxtLink
      >{{
        t("feed.post.loginToComment").slice(t("feed.post.loginLink").length)
      }}
    </p>

    <ConfirmDialog
      :open="!!pendingDelete"
      :title="t('feed.post.deleteCommentConfirmTitle')"
      :description="t('feed.post.deleteCommentConfirm')"
      :busy="deleteBusy"
      @cancel="pendingDelete = null"
      @confirm="confirmDeleteComment"
    />
  </div>
</template>
