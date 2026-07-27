<script setup lang="ts">
import type {
  PostFontFamily,
  PostTextColor,
  PostVisibility,
} from "~/types/post";
import {
  UPLOAD_ACCEPT_IMAGES_ATTR,
  UPLOAD_ALLOWED_IMAGE_EXTENSIONS,
  resolveUploadRule,
} from "~/utils/uploadPolicy";
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

useHead({
  link: [
    {
      rel: "stylesheet",
      href: "https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,500;8..60,600;8..60,700&display=swap",
    },
  ],
});

onMounted(async () => {
  const requestedCategory =
    typeof route.query.category === "string" ? route.query.category : null;

  const jobs: Promise<unknown>[] = [refreshCategories().catch(() => undefined)];
  // When arriving with a ?category= deep link (e.g. from the home page
  // topic cards) the first posts fetch must already be filtered, so the
  // unfiltered refresh is skipped and resolved after categories load.
  if (!requestedCategory && !posts.value.length) {
    jobs.push(refresh().catch(() => undefined));
  }
  // Stories require auth; skip for guests so we don't spam 401s.
  if (auth.isAuthenticated.value) {
    jobs.push(refreshStories().catch(() => undefined));
  }
  await Promise.all(jobs);

  if (requestedCategory) {
    const match = categories.value.find(
      (c) => c.slug === requestedCategory || c.id === requestedCategory,
    );
    if (match) {
      await setCategoryFilter(match.id).catch(() => undefined);
    } else if (!posts.value.length) {
      await refresh().catch(() => undefined);
    }
  }
});

async function onCreate(payload: {
  format?: "update" | "manuscript";
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
      format: payload.format ?? "update",
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
  await setCategoryFilter(id);
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

function openViewer(groupIndex: number) {
  viewerGroupIndex.value = groupIndex;
  viewerOpen.value = true;
}

async function onStoryFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;

  // Stories render as media, so narrow the shared allowlist to images here.
  const rule = resolveUploadRule(file.name, file.type);
  if (!rule || rule.kind !== "image") {
    pushToast(
      t("uploads.errors.imageOnly", {
        allowed: UPLOAD_ALLOWED_IMAGE_EXTENSIONS.join(", "),
      }),
      { tone: "danger" },
    );
    return;
  }

  storyUploading.value = true;
  try {
    const up = await uploadFile(file);
    storyUploadId.value = up.id;
    storyFileName.value = up.fileName;
  } catch {
    // uploadFile already surfaced a toast.
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
                Da Nang TechX
              </span>
            </div>
            <h1
              class="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl"
            >
              {{ $t("feed.title") }}
            </h1>
            <p class="mt-2 max-w-xl text-sm leading-6 text-slate-500">
              <template v-if="auth.isAuthenticated.value">
                {{ $t("feed.subtitleAuth") }}
              </template>
              <template v-else>
                {{ $t("feed.subtitleGuest") }}
              </template>
            </p>
          </div>

          <div
            v-if="auth.isAuthenticated.value"
            class="hidden shrink-0 items-center gap-2 lg:flex"
          >
            <NuxtLink
              to="/feed/write"
              class="inline-flex items-center gap-2 rounded-xl border border-[#cfe0d5] bg-[#e4efe8] px-4 py-2.5 text-sm font-semibold text-[#3f6f5a] transition hover:-translate-y-0.5 hover:bg-[#d7e8dd]"
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
          <NuxtLink
            v-else
            to="/login"
            class="hidden shrink-0 items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-200 transition hover:-translate-y-0.5 hover:bg-brand-700 hover:shadow-md lg:inline-flex"
          >
            {{ $t("empty.login") }}
          </NuxtLink>
        </div>
      </div>
    </header>

    <div class="relative mx-auto max-w-[1180px] px-4 py-6 sm:px-6 sm:py-8">
      <div
        class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_260px] xl:gap-8"
      >
        <div class="min-w-0 space-y-5">
          <NuxtErrorBoundary v-if="auth.isAuthenticated.value">
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
            v-if="auth.isAuthenticated.value"
            ref="composerRef"
            :submitting="submitting"
            :categories="categories"
            @submit="onCreate"
          />

          <NuxtLink
            v-if="auth.isAuthenticated.value"
            to="/feed/write"
            class="manuscript-invite group relative block overflow-hidden rounded-2xl border border-[#d5ddd6] px-5 py-5 transition hover:-translate-y-0.5 hover:border-[#b9c7bd] hover:shadow-md sm:px-6"
          >
            <div class="relative z-[1] max-w-xl">
              <p
                class="text-[11px] font-bold uppercase tracking-[0.18em] text-[#3f6f5a]"
              >
                {{ $t("manuscript.inviteKicker") }}
              </p>
              <p
                class="mt-1 font-[family-name:var(--font-manuscript,Georgia,serif)] text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl"
                style="
                  font-family: 'Source Serif 4', Georgia, 'Times New Roman',
                    serif;
                "
              >
                {{ $t("manuscript.inviteTitle") }}
              </p>
              <p class="mt-2 text-sm leading-6 text-slate-600">
                {{ $t("manuscript.inviteBody") }}
              </p>
              <span
                class="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[#3f6f5a] transition group-hover:gap-2"
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
                  ? 'bg-slate-900 text-white shadow-sm'
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
                  ? 'bg-slate-900 text-white shadow-sm'
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
              auth.isAuthenticated.value
                ? $t('empty.feedBeFirst')
                : $t('empty.feedNoPublic')
            "
            illustration="spark"
            :primary-label="
              auth.isAuthenticated.value
                ? $t('empty.writeAPost')
                : $t('empty.login')
            "
            @primary="
              auth.isAuthenticated.value
                ? composerRef?.focus()
                : navigateTo('/login')
            "
          />

          <div v-else class="space-y-5">
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
                class="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow disabled:opacity-50"
                :disabled="loadingMore"
                @click="loadMore"
              >
                <svg
                  v-if="loadingMore"
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
                {{ loadingMore ? $t("feed.loading") : $t("feed.loadMore") }}
              </button>
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
                auth.isAuthenticated.value
                  ? $t("feed.subtitleAuth")
                  : $t("feed.subtitleGuest")
              }}
            </p>
            <button
              v-if="auth.isAuthenticated.value"
              type="button"
              class="relative mt-4 w-full rounded-xl bg-white px-3 py-2.5 text-xs font-semibold text-slate-900 transition hover:bg-brand-50"
              @click="composerRef?.focus()"
            >
              {{ $t("feed.composer.writeAPost") }}
            </button>
            <NuxtLink
              v-if="auth.isAuthenticated.value"
              to="/feed/write"
              class="relative mt-2 block w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 text-center text-xs font-semibold text-white transition hover:bg-white/20"
            >
              {{ $t("manuscript.writeCta") }}
            </NuxtLink>
            <NuxtLink
              v-else
              to="/login"
              class="relative mt-4 block w-full rounded-xl bg-white px-3 py-2.5 text-center text-xs font-semibold text-slate-900 transition hover:bg-brand-50"
            >
              {{ $t("empty.login") }}
            </NuxtLink>
          </section>
        </aside>
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
        <h2
          id="story-composer-title"
          class="text-base font-semibold text-slate-900"
        >
          {{ $t("feed.stories.newStory") }}
        </h2>
        <p class="text-xs text-slate-500">
          {{ $t("feed.stories.visible24h") }}
        </p>
        <label class="sr-only" for="story-body">{{
          $t("feed.stories.storyText")
        }}</label>
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
            :accept="UPLOAD_ACCEPT_IMAGES_ATTR"
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

<style scoped>
.manuscript-invite {
  background:
    linear-gradient(135deg, rgba(228, 239, 232, 0.95), rgba(247, 248, 246, 0.98)),
    radial-gradient(circle at 100% 0%, rgba(63, 111, 90, 0.12), transparent 40%);
}

.manuscript-invite::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  background: linear-gradient(180deg, #3f6f5a, transparent 80%);
}

html[data-theme="dark"] .manuscript-invite {
  background:
    linear-gradient(135deg, rgba(36, 49, 42, 0.95), rgba(17, 24, 22, 0.98));
  border-color: #2a332e;
}
</style>
