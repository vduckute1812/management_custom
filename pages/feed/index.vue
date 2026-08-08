<script setup lang="ts">
import type {
  PostFontFamily,
  PostReactionType,
  PostTextColor,
  PostVisibility,
} from "~/types/post";
import { PostFormat } from "~/types/post";

const { t } = useI18n();
const auth = useAuth();
const route = useRoute();

const {
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
  removePost,
  setReaction,
  clearReaction,
  sharePost,
} = usePosts();

const { tray, loading: storiesLoading, refresh: refreshStories } = useStories();

const { categories, loading: categoriesLoading } = useCategories();

const composerRef = ref<{ clear: () => void; focus: () => void } | null>(null);
const submitting = ref(false);
const pendingDeletePostId = ref<string | null>(null);
const deletePostBusy = ref(false);

useSeoMeta({
  title: () => t("seo.feed"),
  description: () => t("seo.feedDescription"),
});

useManuscriptFont();

function categoryIdFromRoute(): string | null {
  const raw = route.query.category;
  const requested = typeof raw === "string" ? raw : null;
  if (!requested) return null;
  return (
    categories.value.find((c) => c.slug === requested || c.id === requested)
      ?.id ?? null
  );
}

/** Keep feed posts aligned with `?category=` (URL is the source of truth). */
async function syncFeedFromRoute() {
  const id = categoryIdFromRoute();
  if (id !== categoryFilter.value) {
    await setCategoryFilter(id);
  } else if (!posts.value.length) {
    await refresh();
  }
}

/**
 * First paint: one bootstrap GET (categories + posts). When `?category=` is
 * set we need the category list first to resolve slug→id, then refresh posts
 * for that filter (still cheaper than the old categories+posts fan-out for
 * the common no-filter path).
 */
const categoryQuery = route.query.category;
const needsCategoryLookup =
  typeof categoryQuery === "string" && categoryQuery.length > 0;

if (needsCategoryLookup) {
  await bootstrap().catch(() => undefined);
  await syncFeedFromRoute().catch(() => undefined);
} else if (categoryFilter.value) {
  await setCategoryFilter(null).catch(() => undefined);
} else if (!posts.value.length) {
  await bootstrap().catch(() => undefined);
}

// Don't ship a transient API failure string into the crawler HTML.
if (import.meta.server && error.value) {
  error.value = null;
}

onMounted(() => {
  // Auth restore is non-blocking on /feed — wait until the session is real
  // before loading ACL-aware posts + stories in one bootstrap call.
  let authedFeedSynced = false;
  watch(
    () => auth.isAuthenticated.value,
    (ok) => {
      if (!ok) {
        authedFeedSynced = false;
        return;
      }
      if (!authedFeedSynced) {
        authedFeedSynced = true;
        // SSR shipped the public (guest) feed; refresh once for private posts
        // and stories together.
        void bootstrap().catch(() => undefined);
      }
    },
    { immediate: true },
  );
});

// Same page component is reused for `/feed` ↔ `/feed?category=…`.
watch(
  () => route.query.category,
  () => {
    void syncFeedFromRoute().catch(() => undefined);
  },
);

async function onCreate(payload: {
  format?: PostFormat;
  title?: string;
  body: string;
  visibility: PostVisibility;
  audienceUserIds: string[];
  attachmentIds: string[];
  categoryId: string | null;
  fontFamily: PostFontFamily;
  textColor: PostTextColor;
}) {
  if (!auth.isAuthenticated.value) return;
  submitting.value = true;
  try {
    await createPost({
      format: payload.format ?? PostFormat.Update,
      title: payload.title ?? null,
      body: payload.body,
      visibility: payload.visibility,
      audienceUserIds: payload.audienceUserIds,
      attachmentIds: payload.attachmentIds,
      categoryId: payload.categoryId,
      fontFamily: payload.fontFamily,
      textColor: payload.textColor,
    });
    composerRef.value?.clear();
  } catch {
    // toast from composable
  } finally {
    submitting.value = false;
  }
}

async function onCategoryFilter(id: string | null) {
  const slug = id
    ? (categories.value.find((c) => c.id === id)?.slug ?? null)
    : null;
  await navigateTo({
    path: "/feed",
    query: slug ? { category: slug } : {},
  });
}

async function onShare(id: string, note: string) {
  if (!auth.isAuthenticated.value) return;
  try {
    await sharePost(id, note);
  } catch {
    // handled upstream
  }
}

function requestDeletePost(id: string) {
  if (deletePostBusy.value) return;
  pendingDeletePostId.value = id;
}

async function confirmDeletePost() {
  const id = pendingDeletePostId.value;
  if (!id || deletePostBusy.value) return;
  deletePostBusy.value = true;
  try {
    await removePost(id);
    pendingDeletePostId.value = null;
  } finally {
    deletePostBusy.value = false;
  }
}
</script>

<template>
  <div class="relative min-h-0 flex-1 bg-slate-50">
    <div
      class="feed-ambient pointer-events-none absolute inset-x-0 top-0 h-72"
      aria-hidden="true"
    />

    <FeedPageHeader
      :is-authenticated="auth.isAuthenticatedUi.value"
      @compose="composerRef?.focus()"
    />

    <div class="relative mx-auto max-w-[1180px] px-4 py-6 sm:px-6 sm:py-8">
      <div
        class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_260px] xl:gap-8"
      >
        <div class="min-w-0 space-y-5">
          <FeedStoryTray
            v-if="auth.isAuthenticatedUi.value"
            :groups="tray.groups"
            :loading="storiesLoading"
            @refresh="refreshStories"
          />

          <PostComposer
            v-if="auth.isAuthenticatedUi.value"
            ref="composerRef"
            :submitting="submitting"
            :categories="categories"
            @submit="onCreate"
          />

          <FeedManuscriptInvite v-if="auth.isAuthenticatedUi.value" />

          <FeedCategoryScroller
            :categories="categories"
            :category-filter="categoryFilter"
            :loading="categoriesLoading"
            @filter="onCategoryFilter"
          />

          <FeedPostList
            :posts="posts"
            :loading="loading"
            :loading-more="loadingMore"
            :error="error"
            :next-cursor="nextCursor"
            :is-authenticated="auth.isAuthenticatedUi.value"
            @retry="refresh"
            @react="(id: string, r: PostReactionType) => setReaction(id, r)"
            @clear-react="clearReaction"
            @delete="requestDeletePost"
            @share="onShare"
            @load-more="loadMore"
            @compose="composerRef?.focus()"
          />
        </div>

        <FeedSidebar
          :categories="categories"
          :category-filter="categoryFilter"
          :categories-loading="categoriesLoading"
          :is-authenticated="auth.isAuthenticatedUi.value"
          @filter="onCategoryFilter"
          @compose="composerRef?.focus()"
        />
      </div>
    </div>

    <ConfirmDialog
      :open="!!pendingDeletePostId"
      :title="$t('feed.post.deleteConfirmTitle')"
      :description="$t('feed.post.deleteConfirm')"
      :busy="deletePostBusy"
      @cancel="pendingDeletePostId = null"
      @confirm="confirmDeletePost"
    />
  </div>
</template>
