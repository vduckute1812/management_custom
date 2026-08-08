<script setup lang="ts">
import type { Post, PostReactionType } from "~/types/post";

const props = defineProps<{
  posts: Post[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  nextCursor: string | null;
  isAuthenticated: boolean;
}>();

const emit = defineEmits<{
  retry: [];
  react: [postId: string, reaction: PostReactionType];
  clearReact: [postId: string];
  delete: [postId: string];
  share: [postId: string, note: string];
  loadMore: [];
  compose: [];
}>();

/** Sentinel at list bottom — IntersectionObserver loads the next page. */
const loadMoreSentinel = ref<HTMLElement | null>(null);

onMounted(() => {
  if (typeof IntersectionObserver === "undefined") return;

  function maybeLoadMore() {
    if (!props.nextCursor || props.loadingMore || props.loading) return;
    emit("loadMore");
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
  watch(
    () => props.loadingMore,
    async (busy, wasBusy) => {
      if (busy || !wasBusy || !props.nextCursor) return;
      await nextTick();
      const el = loadMoreSentinel.value;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.top < (window.innerHeight || 0) + 280) {
        maybeLoadMore();
      }
    },
  );
  onBeforeUnmount(() => observer.disconnect());
});
</script>

<template>
  <InlineErrorAlert
    v-if="error"
    :message="error"
    :retry-label="$t('feed.retry')"
    @retry="emit('retry')"
  />

  <div v-if="loading && !posts.length" class="space-y-4" aria-busy="true">
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
      isAuthenticated ? $t('empty.feedBeFirst') : $t('empty.feedNoPublic')
    "
    illustration="spark"
    :primary-label="isAuthenticated ? $t('empty.writeAPost') : undefined"
    @primary="emit('compose')"
  />

  <div v-else class="space-y-5">
    <LazyPostCard
      v-for="post in posts"
      :key="post.id"
      :post="post"
      @react="(r) => emit('react', post.id, r)"
      @clear-react="emit('clearReact', post.id)"
      @delete="emit('delete', post.id)"
      @share="(note) => emit('share', post.id, note)"
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
</template>
