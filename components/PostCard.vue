<script setup lang="ts">
import type { Post, PostComment, PostReactionType } from "~/types/post";
import { POST_REACTION_TYPES } from "~/types/post";
import { TaskStatus } from "~/types/task";

const props = defineProps<{
  post: Post;
}>();

const emit = defineEmits<{
  (e: "react", reaction: PostReactionType): void;
  (e: "clear-react"): void;
  (e: "delete"): void;
  (e: "share", note: string): void;
}>();

const { t } = useI18n();
const { loadComments, addComment, removeComment } = usePosts();
const { saveTask } = useTasks();
const { pushToast } = useToasts();
const { mediaUrl } = useMediaUrl();
const auth = useAuth();

const commentsOpen = ref(false);
const comments = ref<PostComment[]>([]);
const commentsLoading = ref(false);
const commentBody = ref("");
const commentSubmitting = ref(false);
const shareOpen = ref(false);
const shareNote = ref("");
const shareSubmitting = ref(false);
const pickerOpen = ref(false);

const REACTION_EMOJI: Record<PostReactionType, string> = {
  like: "👍",
  love: "❤️",
  haha: "😄",
  wow: "😮",
  sad: "😢",
  angry: "😡",
};

const REACTION_LABEL = computed<Record<PostReactionType, string>>(() => ({
  like: t("feed.post.reactionLike"),
  love: t("feed.post.reactionLove"),
  haha: t("feed.post.reactionHaha"),
  wow: t("feed.post.reactionWow"),
  sad: t("feed.post.reactionSad"),
  angry: t("feed.post.reactionAngry"),
}));

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
    if (mins < 1) return t("feed.post.justNow");
    if (mins < 60) return t("feed.post.minutesAgo", { count: mins });
    const hours = Math.floor(mins / 60);
    if (hours < 24) return t("feed.post.hoursAgo", { count: hours });
    const days = Math.floor(hours / 24);
    if (days < 7) return t("feed.post.daysAgo", { count: days });
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

const visibilityBadge = computed(() => {
  if (props.post.visibility === "private") return t("feed.post.onlyYou");
  if (props.post.visibility === "shared") return t("feed.post.shared");
  return t("feed.post.public");
});

const topReactions = computed(() =>
  POST_REACTION_TYPES.filter((k) => (props.post.reactions?.[k] ?? 0) > 0).map(
    (k) => ({
      type: k,
      count: props.post.reactions[k],
      emoji: REACTION_EMOJI[k],
    }),
  ),
);

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

function onReactClick() {
  if (!auth.isAuthenticated.value) {
    navigateTo({ path: "/login", query: { redirect: "/feed" } });
    return;
  }
  if (props.post.myReaction) {
    emit("clear-react");
  } else {
    emit("react", "like");
  }
}

function pickReaction(r: PostReactionType) {
  if (!auth.isAuthenticated.value) {
    navigateTo({ path: "/login", query: { redirect: "/feed" } });
    return;
  }
  if (props.post.myReaction === r) {
    emit("clear-react");
  } else {
    emit("react", r);
  }
  pickerOpen.value = false;
}

function onShareClick() {
  if (!auth.isAuthenticated.value) {
    navigateTo({ path: "/login", query: { redirect: "/feed" } });
    return;
  }
  shareOpen.value = !shareOpen.value;
}

const planBusy = ref(false);

/**
 * Time Management integration: turn this article into a research task so
 * it can be scheduled, time-tracked, and marked done from /tasks.
 */
async function onPlanClick() {
  if (!auth.isAuthenticated.value) {
    navigateTo({ path: "/login", query: { redirect: "/feed" } });
    return;
  }
  if (planBusy.value) return;
  planBusy.value = true;
  try {
    const excerpt =
      (props.post.body || "").replace(/\s+/g, " ").trim().slice(0, 80) ||
      t("feed.post.planUntitled");
    const tags = ["article"];
    if (props.post.category?.slug) tags.push(props.post.category.slug);
    await saveTask({
      title: t("feed.post.planTaskTitle", { title: excerpt }),
      notes: t("feed.post.planTaskNotes", {
        author: authorLabel(props.post.author.name, props.post.author.email),
        date: new Date(props.post.createdAt).toLocaleString(),
        id: props.post.id,
      }),
      status: TaskStatus.Todo,
      tags,
    });
    pushToast(t("feed.post.planTaskCreated"), {
      tone: "success",
      actionLabel: t("feed.post.planTaskOpen"),
      onAction: async () => {
        await navigateTo("/tasks");
      },
    });
  } catch {
    pushToast(t("feed.post.planTaskFailed"), { tone: "danger" });
  } finally {
    planBusy.value = false;
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
        <div class="flex items-baseline gap-2 min-w-0 flex-wrap">
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
          <span
            class="text-[10px] font-medium uppercase tracking-wide rounded-full bg-slate-100 text-slate-600 px-1.5 py-0.5"
          >
            {{ visibilityBadge }}
          </span>
        </div>
        <p class="text-[11px] text-slate-400 truncate">
          {{ post.author.email }}
        </p>
      </div>
      <button
        v-if="post.canDelete"
        type="button"
        class="text-[11px] text-slate-400 hover:text-rose-600 px-1.5 py-1 rounded"
        :title="$t('feed.post.deleteTitle')"
        @click="emit('delete')"
      >
        {{ $t("feed.post.delete") }}
      </button>
    </header>

    <div class="px-4 pt-3 pb-2 space-y-3">
      <div v-if="post.category" class="flex flex-wrap gap-1.5">
        <span
          class="inline-flex items-center rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-800"
        >
          {{ post.category.name }}
        </span>
      </div>
      <PostBody
        v-if="post.body"
        :body="post.body"
        :font-family="post.fontFamily || 'default'"
        :text-color="post.textColor || 'default'"
      />

      <div
        v-if="post.attachments?.length"
        class="grid gap-2"
        :class="post.attachments.length > 1 ? 'sm:grid-cols-2' : ''"
      >
        <template v-for="att in post.attachments" :key="att.id">
          <a
            v-if="att.kind === 'image'"
            :href="mediaUrl(att.url)"
            target="_blank"
            rel="noopener"
            class="block overflow-hidden rounded-lg border border-slate-200"
          >
            <img
              :src="mediaUrl(att.url)"
              :alt="att.fileName"
              width="640"
              height="360"
              loading="lazy"
              class="w-full max-h-72 object-cover bg-slate-100"
              @error="
                ($event.target as HTMLImageElement).style.display = 'none'
              "
            />
          </a>
          <a
            v-else
            :href="mediaUrl(att.url)"
            target="_blank"
            rel="noopener"
            class="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            <span class="text-lg" aria-hidden="true">📄</span>
            <span class="truncate font-medium">{{ att.fileName }}</span>
            <span class="text-[11px] text-slate-400 shrink-0">
              {{ Math.round(att.sizeBytes / 1024) }} KB
            </span>
          </a>
        </template>
      </div>

      <div
        v-if="post.sharedPost"
        class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 space-y-1.5"
      >
        <p class="text-xs font-medium text-slate-600">
          {{
            authorLabel(
              post.sharedPost.author.name,
              post.sharedPost.author.email,
            )
          }}
          <span class="font-normal text-slate-400">
            · {{ formatWhen(post.sharedPost.createdAt) }}
          </span>
        </p>
        <PostBody :body="post.sharedPost.body" />
      </div>
    </div>

    <div
      class="px-4 py-1.5 flex items-center justify-between text-[11px] text-slate-500 tabular-nums"
    >
      <span class="inline-flex items-center gap-1">
        <template v-if="topReactions.length">
          <span
            v-for="r in topReactions"
            :key="r.type"
            :title="REACTION_LABEL[r.type]"
            >{{ r.emoji }}</span
          >
          <span>{{ post.reactionCount }}</span>
        </template>
        <template v-else>{{ $t("feed.post.zeroReactions") }}</template>
      </span>
      <span>
        {{
          t("feed.post.comments", post.commentCount, {
            count: post.commentCount,
          })
        }}
      </span>
    </div>

    <div class="relative grid grid-cols-4 border-t border-slate-100">
      <div class="relative">
        <button
          type="button"
          class="w-full flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition"
          :class="
            post.myReaction
              ? 'text-brand-700 bg-brand-50/40'
              : 'text-slate-600 hover:bg-slate-50'
          "
          :aria-pressed="Boolean(post.myReaction)"
          @click="onReactClick"
          @mouseenter="pickerOpen = true"
          @focus="pickerOpen = true"
          @mouseleave="pickerOpen = false"
        >
          <span aria-hidden="true">
            {{ post.myReaction ? REACTION_EMOJI[post.myReaction] : "👍" }}
          </span>
          {{
            post.myReaction
              ? REACTION_LABEL[post.myReaction]
              : $t("feed.post.react")
          }}
        </button>
        <div
          v-if="pickerOpen"
          class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 flex gap-0.5 rounded-full border border-slate-200 bg-white px-1.5 py-1 shadow-md z-10"
          role="listbox"
          :aria-label="$t('feed.post.chooseReaction')"
          @mouseenter="pickerOpen = true"
          @mouseleave="pickerOpen = false"
        >
          <button
            v-for="r in POST_REACTION_TYPES"
            :key="r"
            type="button"
            class="h-8 w-8 rounded-full text-base hover:scale-110 transition motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
            :title="REACTION_LABEL[r]"
            :aria-label="REACTION_LABEL[r]"
            @click="pickReaction(r)"
          >
            {{ REACTION_EMOJI[r] }}
          </button>
        </div>
      </div>
      <button
        type="button"
        class="flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
        @click="toggleComments"
      >
        {{ $t("feed.post.comment") }}
      </button>
      <button
        type="button"
        class="flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
        @click="onShareClick"
      >
        {{ $t("feed.post.share") }}
      </button>
      <button
        type="button"
        class="flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition disabled:opacity-50"
        :disabled="planBusy"
        :title="$t('feed.post.planTitle')"
        @click="onPlanClick"
      >
        {{ $t("feed.post.plan") }}
      </button>
    </div>

    <div
      v-if="shareOpen"
      class="border-t border-slate-100 px-4 py-3 space-y-2 bg-slate-50/60"
    >
      <label class="sr-only" :for="`share-${post.id}`">{{
        $t("feed.post.shareNote")
      }}</label>
      <input
        :id="`share-${post.id}`"
        v-model="shareNote"
        type="text"
        maxlength="5000"
        class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
        :placeholder="$t('feed.post.shareNotePlaceholder')"
        @keydown.enter.prevent="onShare"
      />
      <div class="flex justify-end gap-2">
        <button
          type="button"
          class="text-xs text-slate-500 px-2 py-1.5 rounded hover:bg-slate-100"
          @click="shareOpen = false"
        >
          {{ $t("feed.post.cancel") }}
        </button>
        <button
          type="button"
          class="text-xs font-medium text-white bg-brand-600 hover:bg-brand-700 px-3 py-1.5 rounded-lg disabled:opacity-50"
          :disabled="shareSubmitting"
          @click="onShare"
        >
          {{ $t("feed.post.shareNow") }}
        </button>
      </div>
    </div>

    <div
      v-if="commentsOpen"
      class="border-t border-slate-100 px-4 py-3 space-y-3"
    >
      <div v-if="commentsLoading" class="space-y-2" aria-busy="true">
        <SkeletonBlock height="h-10" rounded="rounded-lg" />
        <SkeletonBlock height="h-10" rounded="rounded-lg" />
      </div>
      <ul v-else class="space-y-3">
        <li v-for="comment in comments" :key="comment.id" class="flex gap-2.5">
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
                {{ $t("feed.post.delete") }}
              </button>
            </div>
            <p
              class="text-sm text-slate-700 whitespace-pre-wrap break-words mt-0.5"
            >
              {{ comment.body }}
            </p>
          </div>
        </li>
        <li v-if="!comments.length" class="text-xs text-slate-400 italic">
          {{ $t("feed.post.noCommentsYet") }}
        </li>
      </ul>

      <form
        v-if="auth.isAuthenticated.value"
        class="flex gap-2"
        @submit.prevent="onAddComment"
      >
        <label class="sr-only" :for="`comment-${post.id}`">{{
          $t("feed.post.writeComment")
        }}</label>
        <input
          :id="`comment-${post.id}`"
          v-model="commentBody"
          type="text"
          maxlength="2000"
          class="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
          :placeholder="$t('feed.post.writeCommentPlaceholder')"
          :disabled="commentSubmitting"
        />
        <button
          type="submit"
          class="rounded-lg bg-brand-600 px-3 py-2 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          :disabled="!commentBody.trim() || commentSubmitting"
        >
          {{ $t("feed.post.reply") }}
        </button>
      </form>
      <p v-else class="text-xs text-slate-500">
        <NuxtLink
          to="/login"
          class="font-medium text-brand-700 hover:underline"
        >
          {{ $t("feed.post.loginLink") }} </NuxtLink
        >{{
          $t("feed.post.loginToComment").slice($t("feed.post.loginLink").length)
        }}
      </p>
    </div>
  </article>
</template>
