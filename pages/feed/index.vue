<script setup lang="ts">
const {
  posts,
  nextCursor,
  loading,
  loadingMore,
  error,
  refresh,
  loadMore,
  createPost,
  removePost,
  toggleLike,
  sharePost,
} = usePosts();

const composerRef = ref<{ clear: () => void; focus: () => void } | null>(null);
const submitting = ref(false);

onMounted(async () => {
  if (!posts.value.length) {
    try {
      await refresh();
    } catch {
      // error state already set
    }
  }
});

async function onCreate(body: string) {
  submitting.value = true;
  try {
    await createPost(body);
    composerRef.value?.clear();
  } catch {
    // toast from composable / api
  } finally {
    submitting.value = false;
  }
}

async function onShare(id: string, note: string) {
  try {
    await sharePost(id, note);
  } catch {
    // handled upstream
  }
}
</script>

<template>
  <div class="flex-1 min-h-0">
    <header
      class="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/90 backdrop-blur px-4 sm:px-6 py-4"
    >
      <div class="max-w-2xl mx-auto">
        <h1 class="text-xl font-semibold text-slate-900">Feed</h1>
        <p class="text-sm text-slate-500 mt-0.5">
          Share updates with everyone on this install — like, comment, and reshare.
        </p>
      </div>
    </header>

    <div class="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-4">
      <PostComposer
        ref="composerRef"
        :submitting="submitting"
        @submit="onCreate"
      />

      <div
        v-if="error"
        class="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 flex items-center justify-between gap-3"
        role="alert"
      >
        <span>{{ error }}</span>
        <button
          type="button"
          class="text-xs font-medium underline underline-offset-2"
          @click="refresh"
        >
          Retry
        </button>
      </div>

      <div v-if="loading && !posts.length" class="space-y-3" aria-busy="true">
        <SkeletonBlock
          v-for="n in 3"
          :key="n"
          height="h-36"
          rounded="rounded-xl"
        />
      </div>

      <EmptyState
        v-else-if="!loading && !posts.length && !error"
        title="Nothing here yet"
        description="Be the first to share a post with the group."
        illustration="spark"
        primary-label="Write a post"
        @primary="composerRef?.focus()"
      />

      <div v-else class="space-y-4">
        <PostCard
          v-for="post in posts"
          :key="post.id"
          :post="post"
          @like="toggleLike(post.id)"
          @delete="removePost(post.id)"
          @share="(note) => onShare(post.id, note)"
        />

        <div v-if="nextCursor" class="flex justify-center pt-2">
          <button
            type="button"
            class="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            :disabled="loadingMore"
            @click="loadMore"
          >
            {{ loadingMore ? "Loading…" : "Load more" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
