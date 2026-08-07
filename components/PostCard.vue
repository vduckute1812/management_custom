<script setup lang="ts">
import type { Post, PostReactionType } from "~/types/post";
import { PostFormat, PostVisibility, UploadKind } from "~/types/post";
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

/** Gallery tiles: skip images already shown inline in the markdown body. */
const galleryAttachments = computed(() =>
  (view.value.attachments ?? []).filter((att) => {
    if (att.kind !== UploadKind.Image) return true;
    return !bodyReferencesUpload(view.value.body || "", att.uploadId, att.url);
  }),
);

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
  if (props.post.visibility === PostVisibility.Private) {
    return t("feed.post.onlyYou");
  }
  if (props.post.visibility === PostVisibility.Shared) {
    return t("feed.post.shared");
  }
  if (props.post.visibility === PostVisibility.Friends) {
    return t("feed.post.friends");
  }
  return t("feed.post.public");
});

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
            v-if="att.kind === UploadKind.Image"
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
