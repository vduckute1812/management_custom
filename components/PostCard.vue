<script setup lang="ts">
import type { Post, PostReactionType } from "~/types/post";
import { POST_REACTION_TYPES } from "~/types/post";
import { categoryDisplayName } from "~/utils/categoryLabel";
import { estimateReadingMinutes, manuscriptExcerpt } from "~/utils/manuscript";
import { bodyReferencesUpload } from "~/utils/markdownMedia";
import { CONTENT_LOCALE_LABELS } from "~/utils/contentLocale";

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
const { getPost } = usePosts();
const { pushToast } = useToasts();
const { mediaUrl } = useMediaUrl();
const auth = useAuth();
const { planBusy, planPostAsTask } = usePlanPostAsTask();

/** Active manuscript locale variant shown in this card. */
const view = ref(props.post);
watch(
  () => props.post,
  (next) => {
    view.value = next;
  },
);

const localeSwitching = ref(false);

const translationOptions = computed(() => {
  const p = view.value;
  if (p.format !== "manuscript") return [];
  const map = new Map<
    string,
    { id: string; locale: string; title: string | null }
  >();
  if (p.contentLocale && p.contentLocale !== "und") {
    map.set(p.contentLocale, {
      id: p.id,
      locale: p.contentLocale,
      title: p.title,
    });
  }
  for (const tr of p.translations ?? []) {
    if (tr.locale && tr.locale !== "und") map.set(tr.locale, tr);
  }
  return [...map.values()];
});

async function switchLocale(locale: string) {
  if (locale === view.value.contentLocale) return;
  const target = translationOptions.value.find((tr) => tr.locale === locale);
  if (!target || target.id === view.value.id) return;
  localeSwitching.value = true;
  try {
    view.value = await getPost(target.id);
    bodyExpanded.value = false;
  } catch {
    pushToast(t("toasts.couldNotLoadFeed"), { tone: "danger" });
  } finally {
    localeSwitching.value = false;
  }
}

function localeChipLabel(code: string) {
  return (
    CONTENT_LOCALE_LABELS[code as keyof typeof CONTENT_LOCALE_LABELS] || code
  );
}

/** Gallery tiles: skip images already shown inline in the markdown body. */
const galleryAttachments = computed(() =>
  (view.value.attachments ?? []).filter((att) => {
    if (att.kind !== "image") return true;
    return !bodyReferencesUpload(view.value.body || "", att.uploadId, att.url);
  }),
);

const commentsOpen = ref(false);
const shareOpen = ref(false);
const shareNote = ref("");
const shareSubmitting = ref(false);
const pickerOpen = ref(false);
const reactRoot = ref<HTMLElement | null>(null);
/** Coarse pointers can't hover — click toggles the picker instead of liking. */
const touchLike = ref(false);

onMounted(() => {
  touchLike.value = window.matchMedia("(hover: none)").matches;
  if (!touchLike.value) return;
  // Close the mobile reaction bar when tapping outside it.
  const onDocPointer = (e: Event) => {
    if (!pickerOpen.value) return;
    const root = reactRoot.value;
    const target = e.target as Node | null;
    if (root && target && root.contains(target)) return;
    pickerOpen.value = false;
  };
  document.addEventListener("pointerdown", onDocPointer, true);
  onBeforeUnmount(() => {
    document.removeEventListener("pointerdown", onDocPointer, true);
  });
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

/** Collapse long bodies / manuscripts in the feed until expanded. */
const BODY_COLLAPSE_CHARS = 900;
const bodyExpanded = ref(false);

const isManuscript = computed(() => view.value.format === "manuscript");

const bodyNeedsCollapse = computed(() => {
  if (isManuscript.value) return true;
  return (view.value.body?.length ?? 0) > BODY_COLLAPSE_CHARS;
});

const showExcerptOnly = computed(
  () => isManuscript.value && !bodyExpanded.value,
);

const excerpt = computed(() => manuscriptExcerpt(view.value.body || "", 220));

const readingMinutes = computed(() =>
  estimateReadingMinutes(view.value.body || "", view.value.title || ""),
);

watch(
  () => props.post.id,
  () => {
    bodyExpanded.value = false;
  },
);

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

function toggleComments() {
  commentsOpen.value = !commentsOpen.value;
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

async function onPlanClick() {
  await planPostAsTask(props.post);
}
</script>

<template>
  <article
    class="group rounded-2xl border shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md"
    :class="
      isManuscript
        ? 'manuscript-card'
        : 'border-slate-200 bg-white hover:border-slate-300'
    "
  >
    <header class="flex items-start gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
      <div
        class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden text-sm font-bold text-white shadow-sm"
        :class="
          isManuscript
            ? 'rounded-xl manuscript-avatar ring-4'
            : post.author.avatarUrl
              ? 'rounded-full bg-slate-200 ring-4 ring-brand-50'
              : 'rounded-full bg-gradient-to-br from-brand-500 to-brand-700 ring-4 ring-brand-50'
        "
        aria-hidden="true"
      >
        <img
          v-if="post.author.avatarUrl"
          :src="post.author.avatarUrl"
          alt=""
          class="h-full w-full object-cover"
        />
        <template v-else>
          {{ initialOf(post.author.name, post.author.email) }}
        </template>
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
            v-if="isManuscript"
            class="manuscript-pill rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          >
            {{ $t("manuscript.badge") }}
          </span>
          <span
            class="text-[10px] font-medium uppercase tracking-wide rounded-full bg-slate-100 text-slate-600 px-1.5 py-0.5"
          >
            {{ visibilityBadge }}
          </span>
        </div>
        <p class="text-[11px] text-slate-400 truncate">
          <template v-if="isManuscript">
            {{ $t("manuscript.readingTime", { count: readingMinutes }) }}
            <span aria-hidden="true"> · </span>
          </template>
          <template v-if="post.author.title || post.author.job">
            <span v-if="post.author.title">{{ post.author.title }}</span>
            <span v-if="post.author.title && post.author.job"> · </span>
            <span v-if="post.author.job">{{ post.author.job }}</span>
          </template>
          <template v-else>
            {{ post.author.email }}
          </template>
        </p>
      </div>
      <div
        v-if="post.canEdit || post.canDelete"
        class="flex shrink-0 items-center gap-0.5"
      >
        <button
          v-if="post.canEdit"
          type="button"
          class="rounded-lg px-2 py-1 text-[11px] font-medium text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          :title="$t('feed.post.editTitle')"
          @click="navigateTo(`/feed/edit/${post.id}`)"
        >
          {{ $t("feed.post.edit") }}
        </button>
        <button
          v-if="post.canDelete"
          type="button"
          class="rounded-lg px-2 py-1 text-[11px] font-medium text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
          :title="$t('feed.post.deleteTitle')"
          @click="emit('delete')"
        >
          {{ $t("feed.post.delete") }}
        </button>
      </div>
    </header>

    <div class="min-w-0 max-w-full space-y-3 px-4 pb-3 pt-4 sm:px-5">
      <div v-if="post.category" class="flex flex-wrap gap-1.5">
        <span
          class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset"
          :class="
            isManuscript
              ? 'manuscript-category ring-1 ring-inset'
              : 'bg-brand-50 text-brand-800 ring-brand-100'
          "
        >
          <span
            class="h-1.5 w-1.5 rounded-full"
            :class="isManuscript ? 'manuscript-category__dot' : 'bg-brand-500'"
            aria-hidden="true"
          />
          {{ categoryLabel() }}
        </span>
      </div>

      <div
        v-if="isManuscript && translationOptions.length > 1"
        class="flex flex-wrap items-center gap-1.5"
      >
        <span class="text-[11px] font-medium text-slate-500">{{
          $t("manuscript.viewLanguage")
        }}</span>
        <button
          v-for="tr in translationOptions"
          :key="tr.id"
          type="button"
          class="rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset transition"
          :class="
            tr.locale === view.contentLocale
              ? 'manuscript-locale--active ring-1 ring-inset'
              : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
          "
          :disabled="localeSwitching"
          @click="switchLocale(tr.locale)"
        >
          {{ localeChipLabel(tr.locale) }}
        </button>
        <NuxtLink
          v-if="post.canDelete && view.translationGroupId"
          class="ml-1 text-[11px] font-semibold manuscript-link hover:underline"
          :to="{
            path: '/feed/write',
            query: {
              group: view.translationGroupId,
              from: view.id,
            },
          }"
        >
          {{ $t("manuscript.addTranslation") }}
        </NuxtLink>
      </div>
      <div
        v-else-if="isManuscript && post.canDelete"
        class="flex flex-wrap items-center gap-2"
      >
        <span
          v-if="view.contentLocale && view.contentLocale !== 'und'"
          class="rounded-md manuscript-pill px-2 py-0.5 text-[11px] font-semibold"
        >
          {{ localeChipLabel(view.contentLocale) }}
        </span>
        <NuxtLink
          v-if="view.translationGroupId"
          class="text-[11px] font-semibold manuscript-link hover:underline"
          :to="{
            path: '/feed/write',
            query: {
              group: view.translationGroupId,
              from: view.id,
            },
          }"
        >
          {{ $t("manuscript.addTranslation") }}
        </NuxtLink>
      </div>

      <h2
        v-if="isManuscript && view.title"
        class="manuscript-card__title text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl"
      >
        {{ view.title }}
      </h2>

      <div v-if="view.body" class="relative min-w-0 max-w-full">
        <p
          v-if="showExcerptOnly"
          class="manuscript-card__excerpt text-[15px] leading-7 text-slate-700"
        >
          {{ excerpt }}
        </p>
        <div
          v-else
          class="post-body-clip min-w-0 max-w-full"
          :class="{
            'post-body-clip--collapsed':
              !isManuscript && bodyNeedsCollapse && !bodyExpanded,
          }"
        >
          <PostBody
            :body="view.body"
            :font-family="view.fontFamily || 'default'"
            :text-color="view.textColor || 'default'"
          />
        </div>
        <button
          v-if="bodyNeedsCollapse"
          type="button"
          class="mt-2 text-xs font-semibold"
          :class="
            isManuscript
              ? 'manuscript-read-more'
              : 'text-brand-700 hover:text-brand-800'
          "
          @click="bodyExpanded = !bodyExpanded"
        >
          {{
            bodyExpanded
              ? $t("feed.post.showLess")
              : isManuscript
                ? $t("manuscript.readFull")
                : $t("feed.post.showMore")
          }}
        </button>
      </div>

      <div
        v-if="galleryAttachments.length"
        class="grid gap-2"
        :class="galleryAttachments.length > 1 ? 'sm:grid-cols-2' : ''"
      >
        <template v-for="att in galleryAttachments" :key="att.id">
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
          <span
            v-if="post.sharedPost.format === 'manuscript'"
            class="ml-1 rounded-full manuscript-pill px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          >
            {{ $t("manuscript.badge") }}
          </span>
        </p>
        <p
          v-if="post.sharedPost.title"
          class="text-sm font-semibold text-slate-900"
          style="
            font-family:
              &quot;Source Serif 4&quot;, Georgia, &quot;Times New Roman&quot;,
              serif;
          "
        >
          {{ post.sharedPost.title }}
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
          t(
            "feed.post.comments",
            { count: post.commentCount },
            post.commentCount,
          )
        }}
      </span>
    </div>

    <div
      ref="reactRoot"
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
          Left-aligned (not centered on the React column) so the 6-emoji bar
          stays inside the card on narrow phones. pb-1 is a hover bridge so
          the pointer can travel from the button into the picker.
        -->
        <div
          v-if="pickerOpen"
          class="absolute bottom-full left-0 z-20 w-max pb-1"
          role="listbox"
          :aria-label="$t('feed.post.chooseReaction')"
        >
          <div
            class="flex flex-nowrap gap-0.5 rounded-full border border-slate-200 bg-white px-1.5 py-1 shadow-md"
          >
            <button
              v-for="r in POST_REACTION_TYPES"
              :key="r"
              type="button"
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg leading-none hover:scale-110 transition motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
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

    <PostCommentsPanel :post-id="post.id" :open="commentsOpen" />
  </article>
</template>

<style scoped>
.post-body-clip--collapsed {
  max-height: 18rem;
  overflow: hidden;
  mask-image: linear-gradient(to bottom, #000 55%, transparent);
  -webkit-mask-image: linear-gradient(to bottom, #000 55%, transparent);
}

.manuscript-card__title,
.manuscript-card__excerpt {
  font-family: "Source Serif 4", Georgia, "Times New Roman", serif;
}

.manuscript-card {
  position: relative;
}

.manuscript-card::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: linear-gradient(180deg, var(--mf-accent), transparent 75%);
}
</style>
