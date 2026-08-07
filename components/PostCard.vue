<script setup lang="ts">
import type { Post, PostReactionType } from "~/types/post";
import { PostFormat } from "~/types/post";
import { categoryDisplayName } from "~/utils/categoryLabel";
import { estimateReadingMinutes, manuscriptExcerpt } from "~/utils/manuscript";
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
const auth = useAuth();

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
  if (p.format !== PostFormat.Manuscript) return [];
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

const commentsOpen = ref(false);
const shareOpen = ref(false);
const canInteract = computed(() => auth.isAuthenticated.value);

/** Collapse long bodies / manuscripts in the feed until expanded. */
const BODY_COLLAPSE_CHARS = 900;
const bodyExpanded = ref(false);

const isManuscript = computed(
  () => view.value.format === PostFormat.Manuscript,
);

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

function toggleComments() {
  commentsOpen.value = !commentsOpen.value;
}

function onShareClick() {
  if (!auth.isAuthenticated.value) {
    navigateTo({ path: "/login", query: { redirect: "/feed" } });
    return;
  }
  shareOpen.value = !shareOpen.value;
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
    <PostCardHeader
      :post="post"
      :manuscript="isManuscript"
      :reading-minutes="readingMinutes"
      @delete="emit('delete')"
    />

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

      <PostCardMedia :attachments="view.attachments" :body="view.body" />

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
            v-if="post.sharedPost.format === PostFormat.Manuscript"
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

    <PostCardReactions
      :reactions="post.reactions"
      :reaction-count="post.reactionCount"
      :my-reaction="post.myReaction"
      :comment-count="post.commentCount"
      :can-interact="canInteract"
      @react="emit('react', $event)"
      @clear-react="emit('clear-react')"
      @toggle-comments="toggleComments"
      @share-click="onShareClick"
    />

    <PostShareComposer
      v-if="shareOpen"
      :post-id="post.id"
      @close="shareOpen = false"
      @share="emit('share', $event)"
    />

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
