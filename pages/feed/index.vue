<script setup lang="ts">
import type {
  PostFontFamily,
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
/** Sentinel at list bottom — IntersectionObserver loads the next page. */
const loadMoreSentinel = ref<HTMLElement | null>(null);

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

  // Facebook-style pagination: load the next page when the sentinel enters
  // (or nears) the viewport — no "Load more" button.
  if (typeof IntersectionObserver === "undefined") return;

  function maybeLoadMore() {
    if (!nextCursor.value || loadingMore.value || loading.value) return;
    void loadMore().catch(() => undefined);
  }

  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      maybeLoadMore();
    },
    { root: null, rootMargin: "280px 0px", threshold: 0 },
  );
  watch(
    loadMoreSentinel,
    (el, _prev, onCleanup) => {
      if (!el) return;
      observer.observe(el);
      onCleanup(() => observer.unobserve(el));
    },
    { immediate: true },
  );
  // If the list is still shorter than the viewport after a page loads, the
  // sentinel stays intersecting and IO won't re-fire — keep paging until it
  // leaves the viewport or there is no nextCursor.
  watch(loadingMore, async (busy, wasBusy) => {
    if (busy || !wasBusy || !nextCursor.value) return;
    await nextTick();
    const el = loadMoreSentinel.value;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.top < (window.innerHeight || 0) + 280) {
      maybeLoadMore();
    }
  });
  onBeforeUnmount(() => observer.disconnect());
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

          <InlineErrorAlert
            v-if="error"
            :message="error"
            :retry-label="$t('feed.retry')"
            @retry="refresh"
          />

          <div
            v-if="loading && !posts.length"
            class="space-y-4"
            aria-busy="true"
          >
            <SkeletonBlock
              v-for="n in 3"
              :key="n"
              height="h-52"
              rounded="rounded-2xl"
            />
          </div>

          <EmptyState
            v-else-if="!loading && !posts.length && !error"
            :title="$t('empty.feedNothingYet')"
            :description="
              auth.isAuthenticatedUi.value
                ? $t('empty.feedBeFirst')
                : $t('empty.feedNoPublic')
            "
            illustration="spark"
            :primary-label="
              auth.isAuthenticatedUi.value ? $t('empty.writeAPost') : undefined
            "
            @primary="composerRef?.focus()"
          />

          <div v-else class="space-y-5">
            <LazyPostCard
              v-for="post in posts"
              :key="post.id"
              :post="post"
              @react="(r) => setReaction(post.id, r)"
              @clear-react="clearReaction(post.id)"
              @delete="requestDeletePost(post.id)"
              @share="(note) => onShare(post.id, note)"
            />

            <!--
              Infinite scroll sentinel: when this enters the viewport the
              observer calls loadMore(). Spinner shown while a page is in flight.
            -->
            <div
              v-if="nextCursor"
              ref="loadMoreSentinel"
              class="flex justify-center py-3"
            >
              <div
                v-if="loadingMore"
                class="inline-flex items-center gap-2 text-sm font-medium text-slate-500"
                role="status"
                aria-live="polite"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  class="h-4 w-4 animate-spin"
                  aria-hidden="true"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="9"
                    stroke="currentColor"
                    stroke-opacity=".25"
                    stroke-width="3"
                  />
                  <path
                    d="M21 12a9 9 0 0 0-9-9"
                    stroke="currentColor"
                    stroke-width="3"
                    stroke-linecap="round"
                  />
                </svg>
                {{ $t("feed.loading") }}
              </div>
            </div>
          </div>
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
