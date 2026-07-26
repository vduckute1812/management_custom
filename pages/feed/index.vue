<script setup lang="ts">
import type {
  PostFontFamily,
  PostTextColor,
  PostVisibility,
} from "~/types/post";

const { t } = useI18n();
const auth = useAuth();

const {
  posts,
  nextCursor,
  loading,
  loadingMore,
  error,
  categoryFilter,
  setCategoryFilter,
  refresh,
  loadMore,
  createPost,
  removePost,
  setReaction,
  clearReaction,
  sharePost,
} = usePosts();

const {
  tray,
  loading: storiesLoading,
  refresh: refreshStories,
  createStory,
} = useStories();

const {
  categories,
  loading: categoriesLoading,
  refresh: refreshCategories,
} = useCategories();

const { uploadFile } = useUploads();

const composerRef = ref<{ clear: () => void; focus: () => void } | null>(null);
const submitting = ref(false);
const viewerOpen = ref(false);
const viewerGroupIndex = ref(0);
const storyComposerOpen = ref(false);
const storyBody = ref("");
const storyUploading = ref(false);
const storySubmitting = ref(false);
const storyFileInput = ref<HTMLInputElement | null>(null);
const storyUploadId = ref<string | null>(null);
const storyFileName = ref("");

useSeoMeta({
  title: () => t("seo.feed"),
  description: () => t("seo.feedDescription"),
});

onMounted(async () => {
  const jobs: Promise<unknown>[] = [
    refreshCategories().catch(() => undefined),
    posts.value.length ? Promise.resolve() : refresh().catch(() => undefined),
  ];
  // Stories require auth; skip for guests so we don't spam 401s.
  if (auth.isAuthenticated.value) {
    jobs.push(refreshStories().catch(() => undefined));
  }
  await Promise.all(jobs);
});

async function onCreate(payload: {
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
    await createPost(payload);
    composerRef.value?.clear();
  } catch {
    // toast from composable
  } finally {
    submitting.value = false;
  }
}

async function onCategoryFilter(id: string | null) {
  await setCategoryFilter(id);
}

async function onShare(id: string, note: string) {
  if (!auth.isAuthenticated.value) return;
  try {
    await sharePost(id, note);
  } catch {
    // handled upstream
  }
}

function openViewer(groupIndex: number) {
  viewerGroupIndex.value = groupIndex;
  viewerOpen.value = true;
}

async function onStoryFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  storyUploading.value = true;
  try {
    const up = await uploadFile(file);
    storyUploadId.value = up.id;
    storyFileName.value = up.fileName;
  } finally {
    storyUploading.value = false;
  }
}

async function submitStory() {
  if (storySubmitting.value) return;
  if (!storyBody.value.trim() && !storyUploadId.value) return;
  storySubmitting.value = true;
  try {
    await createStory({
      body: storyBody.value.trim() || null,
      uploadId: storyUploadId.value,
    });
    storyBody.value = "";
    storyUploadId.value = null;
    storyFileName.value = "";
    storyComposerOpen.value = false;
  } catch {
    // toast
  } finally {
    storySubmitting.value = false;
  }
}
</script>

<template>
  <div class="flex-1 min-h-0">
    <header
      class="border-b border-slate-200 bg-slate-50/90 px-4 sm:px-6 py-4"
    >
      <div class="max-w-2xl mx-auto">
        <h1 class="text-xl font-semibold text-slate-900">{{ $t("feed.title") }}</h1>
        <p class="text-sm text-slate-500 mt-0.5">
          <template v-if="auth.isAuthenticated.value">
            {{ $t("feed.subtitleAuth") }}
          </template>
          <template v-else>
            {{ $t("feed.subtitleGuest") }}
          </template>
        </p>
      </div>
    </header>

    <div class="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <NuxtErrorBoundary v-if="auth.isAuthenticated.value">
        <StoryTray
          :groups="tray.groups"
          :loading="storiesLoading"
          @open="openViewer"
          @create="storyComposerOpen = true"
        />
        <template #error="{ clearError }">
          <div class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {{ $t("feed.storiesFailed") }}
            <button type="button" class="underline ml-1" @click="clearError(); refreshStories()">
              {{ $t("feed.retry") }}
            </button>
          </div>
        </template>
      </NuxtErrorBoundary>

      <PostComposer
        v-if="auth.isAuthenticated.value"
        ref="composerRef"
        :submitting="submitting"
        :categories="categories"
        @submit="onCreate"
      />

      <div
        class="flex flex-wrap items-center gap-2"
        role="group"
        :aria-label="$t('feed.categoryFilterAria')"
      >
        <span class="text-xs font-medium text-slate-500">{{ $t("feed.category") }}</span>
        <button
          type="button"
          class="rounded-full px-2.5 py-1 text-xs font-medium transition"
          :class="
            !categoryFilter
              ? 'bg-brand-600 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
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
          class="rounded-full px-2.5 py-1 text-xs font-medium transition"
          :class="
            categoryFilter === cat.id
              ? 'bg-brand-600 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          "
          @click="onCategoryFilter(cat.id)"
        >
          {{ cat.name }}
        </button>
      </div>

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
          {{ $t("feed.retry") }}
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
        :title="$t('empty.feedNothingYet')"
        :description="
          auth.isAuthenticated.value
            ? $t('empty.feedBeFirst')
            : $t('empty.feedNoPublic')
        "
        illustration="spark"
        :primary-label="
          auth.isAuthenticated.value ? $t('empty.writeAPost') : $t('empty.login')
        "
        @primary="
          auth.isAuthenticated.value
            ? composerRef?.focus()
            : navigateTo('/login')
        "
      />

      <div v-else class="space-y-4">
        <PostCard
          v-for="post in posts"
          :key="post.id"
          :post="post"
          @react="(r) => setReaction(post.id, r)"
          @clear-react="clearReaction(post.id)"
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
            {{ loadingMore ? $t("feed.loading") : $t("feed.loadMore") }}
          </button>
        </div>
      </div>
    </div>

    <StoryViewer
      v-if="viewerOpen && tray.groups.length"
      :groups="tray.groups"
      :start-group-index="viewerGroupIndex"
      @close="viewerOpen = false"
    />

    <div
      v-if="storyComposerOpen && auth.isAuthenticated.value"
      class="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="story-composer-title"
      @click.self="storyComposerOpen = false"
    >
      <form
        class="w-full max-w-md rounded-2xl bg-white p-5 space-y-3 shadow-xl"
        @submit.prevent="submitStory"
      >
        <h2 id="story-composer-title" class="text-base font-semibold text-slate-900">
          {{ $t("feed.stories.newStory") }}
        </h2>
        <p class="text-xs text-slate-500">{{ $t("feed.stories.visible24h") }}</p>
        <label class="sr-only" for="story-body">{{ $t("feed.stories.storyText") }}</label>
        <textarea
          id="story-body"
          v-model="storyBody"
          rows="3"
          maxlength="500"
          class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
          :placeholder="$t('feed.stories.placeholder')"
        />
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            :disabled="storyUploading"
            @click="storyFileInput?.click()"
          >
            {{
              storyUploading
                ? $t("feed.stories.uploading")
                : storyFileName || $t("feed.stories.addPhoto")
            }}
          </button>
          <input
            ref="storyFileInput"
            type="file"
            class="hidden"
            accept="image/jpeg,image/png,image/webp,image/gif"
            @change="onStoryFile"
          />
        </div>
        <div class="flex justify-end gap-2 pt-1">
          <button
            type="button"
            class="text-sm text-slate-500 px-3 py-2"
            @click="storyComposerOpen = false"
          >
            {{ $t("feed.stories.cancel") }}
          </button>
          <button
            type="submit"
            class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            :disabled="
              storySubmitting ||
              storyUploading ||
              (!storyBody.trim() && !storyUploadId)
            "
          >
            {{ $t("feed.stories.shareStory") }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
