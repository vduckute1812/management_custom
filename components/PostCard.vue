<script setup lang="ts">
import type { Post, PostComment, PostReactionType } from "~/types/post";
import { POST_REACTION_TYPES } from "~/types/post";
import { TaskStatus } from "~/types/task";
import { categoryDisplayName } from "~/utils/categoryLabel";

const props = defineProps<{
  post: Post;
}>();

const emit = defineEmits<{
  (e: "react", reaction: PostReactionType): void;
  (e: "clear-react"): void;
  (e: "delete"): void;
  (e: "share", note: string): void;
}>();

const { t, te } = useI18n();
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
/** Coarse pointers can't hover — click toggles the picker instead of liking. */
const touchLike = ref(false);

onMounted(() => {
  touchLike.value = window.matchMedia("(hover: none)").matches;
});

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

function categoryLabel() {
  return props.post.category
    ? categoryDisplayName(props.post.category, t, te)
    : "";
}

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
  // Touch devices: open/close the picker (can't hover). Desktop: quick
  // click toggles like / clears the current reaction.
  if (touchLike.value) {
    pickerOpen.value = !pickerOpen.value;
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

function onReactPointerEnter() {
  if (!touchLike.value) pickerOpen.value = true;
}

function onReactPointerLeave(e: MouseEvent | FocusEvent) {
  if (touchLike.value) return;
  const next = (e as FocusEvent).relatedTarget as Node | null;
  const root = e.currentTarget as Node | null;
  if (next && root?.contains(next)) return;
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
  <article
    class="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
  >
    <header class="flex items-start gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
      <div
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white shadow-sm ring-4 ring-brand-50"
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
        class="rounded-lg px-2 py-1 text-[11px] font-medium text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
        :title="$t('feed.post.deleteTitle')"
        @click="emit('delete')"
      >
        {{ $t("feed.post.delete") }}
      </button>
    </header>

    <div class="space-y-3 px-4 pb-3 pt-4 sm:px-5">
      <div v-if="post.category" class="flex flex-wrap gap-1.5">
        <span
          class="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-800 ring-1 ring-inset ring-brand-100"
        >
          <span
            class="h-1.5 w-1.5 rounded-full bg-brand-500"
            aria-hidden="true"
          />
          {{ categoryLabel() }}
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
            class="block overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
          >
            <img
              :src="mediaUrl(att.url)"
              :alt="att.fileName"
              width="640"
              height="360"
              loading="lazy"
              class="w-full max-h-96 object-cover bg-slate-100 transition duration-300 group-hover:scale-[1.01]"
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
        class="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
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
      class="flex items-center justify-between px-4 py-2 text-[11px] tabular-nums text-slate-500 sm:px-5"
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

    <div
      class="relative grid grid-cols-4 border-t border-slate-100 bg-slate-50/40 px-1 py-1"
    >
      <div
        class="relative"
        @mouseenter="onReactPointerEnter"
        @mouseleave="onReactPointerLeave"
        @focusin="onReactPointerEnter"
        @focusout="onReactPointerLeave"
      >
        <button
          type="button"
          class="flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition sm:text-sm"
          :class="
            post.myReaction
              ? 'text-brand-700 bg-brand-50/40'
              : 'text-slate-600 hover:bg-slate-50'
          "
          :aria-pressed="Boolean(post.myReaction)"
          :aria-expanded="pickerOpen"
          @click="onReactClick"
        >
          <span class="text-base" aria-hidden="true">
            {{ post.myReaction ? REACTION_EMOJI[post.myReaction] : "👍" }}
          </span>
          {{
            post.myReaction
              ? REACTION_LABEL[post.myReaction]
              : $t("feed.post.react")
          }}
        </button>
        <!--
          Outer shell uses pb-1 as a hover bridge so the pointer can travel
          from the button into the floating picker without closing it.
        -->
        <div
          v-if="pickerOpen"
          class="absolute bottom-full left-1/2 z-10 w-max -translate-x-1/2 pb-1"
          role="listbox"
          :aria-label="$t('feed.post.chooseReaction')"
        >
          <div
            class="flex gap-0.5 rounded-full border border-slate-200 bg-white px-1.5 py-1 shadow-md"
          >
            <button
              v-for="r in POST_REACTION_TYPES"
              :key="r"
              type="button"
              class="h-8 w-8 rounded-full text-base hover:scale-110 transition motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
              :title="REACTION_LABEL[r]"
              :aria-label="REACTION_LABEL[r]"
              @click.stop="pickReaction(r)"
            >
              {{ REACTION_EMOJI[r] }}
            </button>
          </div>
        </div>
      </div>
      <button
        type="button"
        class="flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold text-slate-600 transition hover:bg-white hover:text-slate-900 hover:shadow-sm sm:text-sm"
        @click="toggleComments"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="hidden h-4 w-4 sm:block"
          aria-hidden="true"
        >
          <path
            d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z"
            stroke-linejoin="round"
          />
        </svg>
        {{ $t("feed.post.comment") }}
      </button>
      <button
        type="button"
        class="flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold text-slate-600 transition hover:bg-white hover:text-slate-900 hover:shadow-sm sm:text-sm"
        @click="onShareClick"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="hidden h-4 w-4 sm:block"
          aria-hidden="true"
        >
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="m8.7 10.7 6.6-4.4M8.7 13.3l6.6 4.4" />
        </svg>
        {{ $t("feed.post.share") }}
      </button>
      <button
        type="button"
        class="flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold text-slate-600 transition hover:bg-white hover:text-slate-900 hover:shadow-sm disabled:opacity-50 sm:text-sm"
        :disabled="planBusy"
        :title="$t('feed.post.planTitle')"
        @click="onPlanClick"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="hidden h-4 w-4 sm:block"
          aria-hidden="true"
        >
          <rect x="4" y="4" width="16" height="16" rx="3" />
          <path d="M8 2v4M16 2v4M8 11h8M8 15h5" stroke-linecap="round" />
        </svg>
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
