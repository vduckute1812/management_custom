<script setup lang="ts">
import type {
  PostFontFamily,
  PostTextColor,
  PostVisibility,
} from "~/types/post";
import { PostFormat } from "~/types/post";
import { categoryDisplayName } from "~/utils/categoryLabel";

const { t, te } = useI18n();
const auth = useAuth();
const route = useRoute();
const { pushToast } = useToasts();

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
const viewerOpen = ref(false);
const viewerGroupIndex = ref(0);
const storyComposerOpen = ref(false);
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

function catLabel(cat: { slug: string; name: string }) {
  return categoryDisplayName(cat, t, te);
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

function openViewer(groupIndex: number) {
  viewerGroupIndex.value = groupIndex;
  viewerOpen.value = true;
}
</script>

<template>
  <div class="relative min-h-0 flex-1 bg-slate-50">
    <div
      class="feed-ambient pointer-events-none absolute inset-x-0 top-0 h-72"
      aria-hidden="true"
    />

    <header
      class="relative border-b border-slate-200 bg-white px-4 py-7 sm:px-6 sm:py-9"
    >
      <div class="mx-auto max-w-[1180px]">
        <div class="flex items-start justify-between gap-6">
          <div class="max-w-2xl">
            <div class="mb-3 flex items-center gap-2">
              <span
                class="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm shadow-brand-200"
                aria-hidden="true"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  class="h-4 w-4"
                >
                  <path d="M4 5.5h16v11H8l-4 3v-14Z" stroke-linejoin="round" />
                  <path d="M8 9h8M8 13h5" stroke-linecap="round" />
                </svg>
              </span>
              <span
                class="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700"
              >
                {{ $t("home.brand") }}
              </span>
            </div>
            <h1
              class="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
            >
              {{ $t("feed.title") }}
            </h1>
            <p class="mt-2 max-w-xl text-sm leading-6 text-slate-500">
              <template v-if="auth.isAuthenticatedUi.value">
                {{ $t("feed.subtitleAuth") }}
              </template>
              <template v-else>
                {{ $t("feed.subtitleGuest") }}
              </template>
            </p>
          </div>

          <div
            v-if="auth.isAuthenticatedUi.value"
            class="hidden shrink-0 items-center gap-2 lg:flex"
          >
            <NuxtLink
              to="/feed/write"
              class="feed-manuscript-btn inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition hover:-translate-y-0.5"
            >
              {{ $t("manuscript.writeCta") }}
            </NuxtLink>
            <button
              type="button"
              class="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-200 transition hover:-translate-y-0.5 hover:bg-brand-700 hover:shadow-md"
              @click="composerRef?.focus()"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                class="h-4 w-4"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12h14" stroke-linecap="round" />
              </svg>
              {{ $t("feed.composer.writeAPost") }}
            </button>
          </div>
        </div>
      </div>
    </header>

    <div class="relative mx-auto max-w-[1180px] px-4 py-6 sm:px-6 sm:py-8">
      <div
        class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_260px] xl:gap-8"
      >
        <div class="min-w-0 space-y-5">
          <NuxtErrorBoundary v-if="auth.isAuthenticatedUi.value">
            <div
              class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
            >
              <StoryTray
                :groups="tray.groups"
                :loading="storiesLoading"
                @open="openViewer"
                @create="storyComposerOpen = true"
              />
            </div>
            <template #error="{ clearError }">
              <div
                class="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-sm"
              >
                {{ $t("feed.storiesFailed") }}
                <button
                  type="button"
                  class="ml-1 font-medium underline underline-offset-2"
                  @click="
                    clearError();
                    refreshStories();
                  "
                >
                  {{ $t("feed.retry") }}
                </button>
              </div>
            </template>
          </NuxtErrorBoundary>

          <PostComposer
            v-if="auth.isAuthenticatedUi.value"
            ref="composerRef"
            :submitting="submitting"
            :categories="categories"
            @submit="onCreate"
          />

          <NuxtLink
            v-if="auth.isAuthenticatedUi.value"
            to="/feed/write"
            class="manuscript-invite group relative block overflow-hidden rounded-2xl border border-[color:var(--mf-border)] px-5 py-5 transition hover:-translate-y-0.5 hover:border-[color:var(--mf-border-hover)] hover:shadow-md sm:px-6"
          >
            <div class="relative z-[1] max-w-xl">
              <p
                class="feed-manuscript-kicker text-[11px] font-bold uppercase tracking-[0.18em]"
              >
                {{ $t("manuscript.inviteKicker") }}
              </p>
              <p
                class="mt-1 font-[family-name:var(--font-manuscript,Georgia,serif)] text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl"
                style="
                  font-family:
                    &quot;Source Serif 4&quot;, Georgia,
                    &quot;Times New Roman&quot;, serif;
                "
              >
                {{ $t("manuscript.inviteTitle") }}
              </p>
              <p class="mt-2 text-sm leading-6 text-slate-600">
                {{ $t("manuscript.inviteBody") }}
              </p>
              <span
                class="feed-manuscript-action mt-3 inline-flex items-center gap-1.5 text-sm font-semibold transition group-hover:gap-2"
              >
                {{ $t("manuscript.inviteAction") }}
                <span aria-hidden="true">→</span>
              </span>
            </div>
          </NuxtLink>

          <div
            class="flex items-center gap-2 overflow-x-auto pb-1 lg:hidden"
            role="group"
            :aria-label="$t('feed.categoryFilterAria')"
          >
            <button
              type="button"
              class="shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition"
              :class="
                !categoryFilter
                  ? 'feed-category-chip--active shadow-sm'
                  : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
              "
              :disabled="categoriesLoading"
              @click="onCategoryFilter(null)"
            >
              {{ $t("feed.all") }}
            </button>
            <button
              v-for="cat in categories"
              :key="cat.id"
              type="button"
              class="shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition"
              :class="
                categoryFilter === cat.id
                  ? 'feed-category-chip--active shadow-sm'
                  : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
              "
              @click="onCategoryFilter(cat.id)"
            >
              {{ catLabel(cat) }}
              <span
                v-if="cat.postCount !== undefined"
                class="ml-1 tabular-nums opacity-60"
              >
                {{ cat.postCount }}
              </span>
            </button>
          </div>

          <div
            v-if="error"
            class="flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-sm"
            role="alert"
          >
            <span>{{ error }}</span>
            <button
              type="button"
              class="shrink-0 text-xs font-semibold underline underline-offset-2"
              @click="refresh"
            >
              {{ $t("feed.retry") }}
            </button>
          </div>

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

        <aside class="sticky top-20 hidden space-y-4 lg:block">
          <section
            class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
            <div class="border-b border-slate-100 px-4 py-3.5">
              <h2
                class="text-xs font-bold uppercase tracking-[0.14em] text-slate-500"
              >
                {{ $t("feed.category") }}
              </h2>
            </div>
            <div
              class="space-y-1 p-2"
              role="group"
              :aria-label="$t('feed.categoryFilterAria')"
            >
              <button
                type="button"
                class="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition"
                :class="
                  !categoryFilter
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                "
                :disabled="categoriesLoading"
                @click="onCategoryFilter(null)"
              >
                <span class="flex items-center gap-2.5">
                  <span
                    class="h-2 w-2 rounded-full"
                    :class="!categoryFilter ? 'bg-brand-500' : 'bg-slate-300'"
                  />
                  {{ $t("feed.all") }}
                </span>
              </button>
              <button
                v-for="cat in categories"
                :key="cat.id"
                type="button"
                class="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition"
                :class="
                  categoryFilter === cat.id
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                "
                @click="onCategoryFilter(cat.id)"
              >
                <span class="flex min-w-0 items-center gap-2.5">
                  <span
                    class="h-2 w-2 shrink-0 rounded-full"
                    :class="
                      categoryFilter === cat.id
                        ? 'bg-brand-500'
                        : 'bg-slate-300'
                    "
                  />
                  <span class="truncate">{{ catLabel(cat) }}</span>
                </span>
                <span
                  v-if="cat.postCount !== undefined"
                  class="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] tabular-nums text-slate-500"
                >
                  {{ cat.postCount }}
                </span>
              </button>
            </div>
          </section>

          <section
            class="relative overflow-hidden rounded-2xl bg-slate-900 p-5 text-white shadow-sm"
          >
            <div
              class="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-brand-500/30 blur-2xl"
              aria-hidden="true"
            />
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
              class="relative mb-4 h-6 w-6 text-brand-300"
              aria-hidden="true"
            >
              <path d="M8 12h8M12 8v8" stroke-linecap="round" />
              <circle cx="12" cy="12" r="9" />
            </svg>
            <p class="relative text-sm font-semibold leading-5">
              {{ $t("feed.title") }}
            </p>
            <p class="relative mt-2 text-xs leading-5 text-slate-300">
              {{
                auth.isAuthenticatedUi.value
                  ? $t("feed.subtitleAuth")
                  : $t("feed.subtitleGuest")
              }}
            </p>
            <button
              v-if="auth.isAuthenticatedUi.value"
              type="button"
              class="relative mt-4 w-full rounded-xl bg-white px-3 py-2.5 text-xs font-semibold text-slate-900 transition hover:bg-brand-50"
              @click="composerRef?.focus()"
            >
              {{ $t("feed.composer.writeAPost") }}
            </button>
            <NuxtLink
              v-if="auth.isAuthenticatedUi.value"
              to="/feed/write"
              class="relative mt-2 block w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 text-center text-xs font-semibold text-white transition hover:bg-white/20"
            >
              {{ $t("manuscript.writeCta") }}
            </NuxtLink>
          </section>
        </aside>
      </div>
    </div>

    <LazyStoryViewer
      v-if="viewerOpen && tray.groups.length"
      :groups="tray.groups"
      :start-group-index="viewerGroupIndex"
      @close="viewerOpen = false"
    />

    <ConfirmDialog
      :open="!!pendingDeletePostId"
      :title="$t('feed.post.deleteConfirmTitle')"
      :description="$t('feed.post.deleteConfirm')"
      :busy="deletePostBusy"
      @cancel="pendingDeletePostId = null"
      @confirm="confirmDeletePost"
    />

    <FeedStoryComposer
      v-if="auth.isAuthenticatedUi.value"
      v-model:open="storyComposerOpen"
    />
  </div>
</template>

<style scoped>
.manuscript-invite {
  background:
    linear-gradient(
      135deg,
      rgba(228, 239, 232, 0.95),
      rgba(247, 248, 246, 0.98)
    ),
    radial-gradient(circle at 100% 0%, rgba(63, 111, 90, 0.12), transparent 40%);
}

.manuscript-invite::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  background: linear-gradient(180deg, var(--mf-accent), transparent 80%);
}

html[data-theme="dark"] .manuscript-invite {
  background: linear-gradient(
    135deg,
    rgba(36, 49, 42, 0.95),
    rgba(17, 24, 22, 0.98)
  );
  border-color: #2a332e;
}

html[data-theme="dark"] .manuscript-invite .text-slate-900 {
  color: #f1f5f9 !important;
}

html[data-theme="dark"] .manuscript-invite .text-slate-600 {
  color: #94a3b8 !important;
}
</style>
