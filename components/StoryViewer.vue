<script setup lang="ts">
import type { PostReactionType } from "~/types/post";
import { POST_REACTION_TYPES } from "~/types/post";
import type { StoryAuthorGroup, StoryInsights } from "~/types/story";

const props = defineProps<{
  groups: StoryAuthorGroup[];
  startGroupIndex: number;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const { t } = useI18n();
const { markViewed, removeStory, setReaction, clearReaction, fetchInsights } =
  useStories();
const { mediaUrl } = useMediaUrl();

const groupIndex = ref(props.startGroupIndex);
const storyIndex = ref(0);
const progress = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;
const STORY_MS = 5000;

const insightsOpen = ref(false);
const insightsLoading = ref(false);
const insights = ref<StoryInsights | null>(null);
const reacting = ref(false);
const deleteConfirmOpen = ref(false);
const deleteBusy = ref(false);

const REACTION_EMOJI: Record<PostReactionType, string> = {
  like: "👍",
  love: "❤️",
  haha: "😄",
  wow: "😮",
  sad: "😢",
  angry: "😡",
};

const group = computed(() => props.groups[groupIndex.value] ?? null);
const story = computed(() => group.value?.stories[storyIndex.value] ?? null);
const isOwnStory = computed(() => !!story.value?.canDelete);

function clearTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

async function loadInsights() {
  if (!story.value?.canDelete) {
    insights.value = null;
    return;
  }
  insightsLoading.value = true;
  try {
    insights.value = await fetchInsights(story.value.id);
  } catch {
    insights.value = null;
  } finally {
    insightsLoading.value = false;
  }
}

async function startTimer() {
  clearTimer();
  progress.value = 0;
  insightsOpen.value = false;
  if (!story.value) return;
  if (!story.value.viewedByMe && !story.value.canDelete) {
    try {
      await markViewed(story.value.id);
    } catch {
      // non-fatal
    }
  }
  if (story.value.canDelete) {
    void loadInsights();
  } else {
    insights.value = null;
  }
  const started = Date.now();
  timer = setInterval(() => {
    if (insightsOpen.value) return;
    const elapsed = Date.now() - started;
    progress.value = Math.min(100, (elapsed / STORY_MS) * 100);
    if (elapsed >= STORY_MS) {
      clearTimer();
      next();
    }
  }, 50);
}

function next() {
  if (!group.value) {
    emit("close");
    return;
  }
  if (storyIndex.value + 1 < group.value.stories.length) {
    storyIndex.value += 1;
    void startTimer();
    return;
  }
  if (groupIndex.value + 1 < props.groups.length) {
    groupIndex.value += 1;
    storyIndex.value = 0;
    void startTimer();
    return;
  }
  emit("close");
}

function prev() {
  if (storyIndex.value > 0) {
    storyIndex.value -= 1;
    void startTimer();
    return;
  }
  if (groupIndex.value > 0) {
    groupIndex.value -= 1;
    storyIndex.value =
      (props.groups[groupIndex.value]?.stories.length ?? 1) - 1;
    void startTimer();
  }
}

function requestDelete() {
  if (!story.value?.canDelete || deleteBusy.value) return;
  clearTimer();
  deleteConfirmOpen.value = true;
}

async function onDelete() {
  if (!story.value?.canDelete) return;
  const id = story.value.id;
  deleteBusy.value = true;
  try {
    clearTimer();
    await removeStory(id);
    deleteConfirmOpen.value = false;
    emit("close");
  } finally {
    deleteBusy.value = false;
  }
}

function cancelDelete() {
  if (deleteBusy.value) return;
  deleteConfirmOpen.value = false;
  void startTimer();
}

async function onReact(reaction: PostReactionType) {
  if (!story.value || reacting.value || story.value.canDelete) return;
  reacting.value = true;
  try {
    if (story.value.myReaction === reaction) {
      await clearReaction(story.value.id);
    } else {
      await setReaction(story.value.id, reaction);
    }
  } finally {
    reacting.value = false;
  }
}

function openInsights() {
  if (!isOwnStory.value) return;
  insightsOpen.value = true;
  clearTimer();
  void loadInsights();
}

function closeInsights() {
  insightsOpen.value = false;
  void startTimer();
}

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") {
    if (deleteConfirmOpen.value) {
      cancelDelete();
      return;
    }
    if (insightsOpen.value) {
      closeInsights();
      return;
    }
    emit("close");
  }
  if (insightsOpen.value || deleteConfirmOpen.value) return;
  if (e.key === "ArrowRight") next();
  if (e.key === "ArrowLeft") prev();
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

onMounted(() => {
  window.addEventListener("keydown", onKey);
  void startTimer();
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey);
  clearTimer();
});

watch(
  () => props.startGroupIndex,
  (i) => {
    groupIndex.value = i;
    storyIndex.value = 0;
    void startTimer();
  },
);
</script>

<template>
  <div
    class="fixed inset-0 z-50 bg-slate-950/95 flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
    :aria-label="$t('feed.stories.viewerAria')"
  >
    <button
      type="button"
      class="absolute top-4 right-4 text-white/80 hover:text-white text-sm"
      @click="emit('close')"
    >
      {{ $t("feed.stories.close") }}
    </button>

    <div
      v-if="story && group"
      class="relative w-full max-w-md aspect-[9/16] max-h-[85vh] rounded-2xl overflow-hidden bg-slate-900 text-white shadow-xl"
    >
      <div class="absolute inset-x-0 top-0 z-10 flex gap-1 p-2">
        <div
          v-for="(s, i) in group.stories"
          :key="s.id"
          class="h-0.5 flex-1 rounded-full bg-white/30 overflow-hidden"
        >
          <div
            class="h-full bg-white transition-[width] duration-75 ease-linear motion-reduce:transition-none"
            :style="{
              width:
                i < storyIndex
                  ? '100%'
                  : i === storyIndex
                    ? `${progress}%`
                    : '0%',
            }"
          />
        </div>
      </div>

      <div
        class="absolute inset-x-0 top-3 z-10 px-3 pt-3 flex items-center justify-between gap-2"
      >
        <p class="text-sm font-semibold truncate">
          {{ group.author.name || group.author.email }}
        </p>
        <div class="flex items-center gap-2 shrink-0">
          <button
            v-if="isOwnStory"
            type="button"
            class="text-xs text-white/80 hover:text-white rounded px-1.5 py-0.5 bg-white/10"
            @click="openInsights"
          >
            {{
              t(
                "feed.stories.views",
                { count: story.viewCount },
                story.viewCount,
              )
            }}
          </button>
          <button
            v-if="story.canDelete"
            type="button"
            class="text-xs text-white/70 hover:text-rose-300"
            @click="requestDelete"
          >
            {{ $t("feed.stories.delete") }}
          </button>
        </div>
      </div>

      <button
        type="button"
        class="absolute inset-y-0 left-0 w-1/3 z-[5]"
        :aria-label="$t('feed.stories.previous')"
        @click="prev"
      />
      <button
        type="button"
        class="absolute inset-y-0 right-0 w-1/3 z-[5]"
        :aria-label="$t('feed.stories.next')"
        @click="next"
      />

      <div
        class="absolute inset-0 flex items-center justify-center p-6 pt-14 pb-20"
      >
        <img
          v-if="story.mediaUrl && story.mime?.startsWith('image/')"
          :src="mediaUrl(story.mediaUrl)"
          :alt="story.body || $t('feed.stories.storyMediaAlt')"
          width="400"
          height="711"
          class="max-h-full max-w-full object-contain"
        />
        <p
          v-if="story.body"
          class="text-center text-lg font-medium leading-relaxed whitespace-pre-wrap"
          :class="
            story.mediaUrl ? 'absolute bottom-20 inset-x-6 drop-shadow' : ''
          "
        >
          {{ story.body }}
        </p>
      </div>

      <!-- Reactions for others' stories -->
      <div
        v-if="!isOwnStory"
        class="absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-center justify-center gap-1 p-3 bg-gradient-to-t from-black/60 to-transparent"
      >
        <button
          v-for="r in POST_REACTION_TYPES"
          :key="r"
          type="button"
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl leading-none transition hover:scale-110 motion-reduce:transition-none"
          :class="
            story.myReaction === r
              ? 'bg-white/25 ring-1 ring-white/50'
              : 'bg-white/10 hover:bg-white/20'
          "
          :aria-label="r"
          :disabled="reacting"
          @click.stop="onReact(r)"
        >
          {{ REACTION_EMOJI[r] }}
        </button>
      </div>

      <!-- Own story: open insights sheet -->
      <button
        v-else
        type="button"
        class="absolute inset-x-0 bottom-0 z-10 flex items-center justify-between gap-2 px-4 py-3 bg-gradient-to-t from-black/70 to-transparent text-left"
        @click="openInsights"
      >
        <span class="text-xs text-white/90">
          {{
            $t("feed.stories.viewsReactions", {
              views: story.viewCount,
              reactions: story.reactionCount,
            })
          }}
        </span>
        <span class="text-xs font-medium text-white/80">{{
          $t("feed.stories.details")
        }}</span>
      </button>
    </div>

    <!-- Insights bottom sheet (My Story) -->
    <Teleport to="body">
      <Transition name="sheet">
        <div
          v-if="insightsOpen && isOwnStory"
          class="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/50 sm:items-center"
          @click.self="closeInsights"
        >
          <div
            class="w-full max-w-md max-h-[75vh] overflow-hidden rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl flex flex-col"
            role="dialog"
            aria-modal="true"
            :aria-label="$t('feed.stories.insightsAria')"
          >
            <div
              class="flex items-center justify-between border-b border-slate-200 px-4 py-3"
            >
              <div>
                <p class="text-sm font-semibold text-slate-900">
                  {{ $t("feed.stories.myStory") }}
                </p>
                <p class="text-xs text-slate-500">
                  {{
                    $t("feed.stories.viewsReactions", {
                      views: insights?.viewCount ?? story?.viewCount ?? 0,
                      reactions:
                        insights?.reactionCount ?? story?.reactionCount ?? 0,
                    })
                  }}
                </p>
              </div>
              <button
                type="button"
                class="text-sm text-slate-500 hover:text-slate-800 px-2 py-1"
                @click="closeInsights"
              >
                {{ $t("feed.stories.close") }}
              </button>
            </div>

            <div class="overflow-y-auto flex-1 px-4 py-3 space-y-5">
              <div v-if="insightsLoading" class="space-y-2" aria-busy="true">
                <SkeletonBlock height="h-10" rounded="rounded-lg" />
                <SkeletonBlock height="h-10" rounded="rounded-lg" />
              </div>

              <template v-else-if="insights">
                <section>
                  <h3
                    class="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2"
                  >
                    {{ $t("feed.stories.viewers") }}
                  </h3>
                  <ul v-if="insights.viewers.length" class="space-y-2">
                    <li
                      v-for="v in insights.viewers"
                      :key="v.user.id"
                      class="flex items-center gap-3"
                    >
                      <UserAvatar
                        :name="v.user.name"
                        :email="v.user.email"
                        :avatar-url="v.user.avatarUrl"
                        size="md"
                      />
                      <div class="min-w-0 flex-1">
                        <p class="truncate text-sm font-medium text-slate-800">
                          {{ v.user.name || v.user.email }}
                        </p>
                        <p class="text-[11px] text-slate-400">
                          {{ formatWhen(v.viewedAt) }}
                        </p>
                      </div>
                      <span
                        v-if="v.reaction"
                        class="text-base"
                        :title="v.reaction"
                      >
                        {{ REACTION_EMOJI[v.reaction] }}
                      </span>
                    </li>
                  </ul>
                  <p v-else class="text-sm text-slate-500">
                    {{ $t("feed.stories.noViewsYet") }}
                  </p>
                </section>

                <section>
                  <h3
                    class="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2"
                  >
                    {{ $t("feed.stories.reactions") }}
                  </h3>
                  <div
                    v-if="insights.reactionCount"
                    class="flex flex-wrap gap-2 mb-3"
                  >
                    <span
                      v-for="r in POST_REACTION_TYPES.filter(
                        (k) => (insights?.reactions[k] ?? 0) > 0,
                      )"
                      :key="r"
                      class="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                    >
                      {{ REACTION_EMOJI[r] }}
                      {{ insights.reactions[r] }}
                    </span>
                  </div>
                  <ul v-if="insights.reactionUsers.length" class="space-y-2">
                    <li
                      v-for="ru in insights.reactionUsers"
                      :key="`${ru.user.id}-${ru.reaction}`"
                      class="flex items-center gap-3"
                    >
                      <span class="text-base">{{
                        REACTION_EMOJI[ru.reaction]
                      }}</span>
                      <div class="min-w-0 flex-1">
                        <p class="truncate text-sm font-medium text-slate-800">
                          {{ ru.user.name || ru.user.email }}
                        </p>
                        <p class="text-[11px] text-slate-400">
                          {{ formatWhen(ru.createdAt) }}
                        </p>
                      </div>
                    </li>
                  </ul>
                  <p v-else class="text-sm text-slate-500">
                    {{ $t("feed.stories.noReactionsYet") }}
                  </p>
                </section>
              </template>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <ConfirmDialog
      :open="deleteConfirmOpen"
      :title="$t('feed.stories.deleteConfirmTitle')"
      :description="$t('feed.stories.deleteConfirm')"
      :busy="deleteBusy"
      @cancel="cancelDelete"
      @confirm="onDelete"
    />
  </div>
</template>

<style scoped>
.sheet-enter-active,
.sheet-leave-active {
  transition: opacity 0.2s ease;
}
.sheet-enter-active > div,
.sheet-leave-active > div {
  transition: transform 0.2s ease;
}
.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}
.sheet-enter-from > div,
.sheet-leave-to > div {
  transform: translateY(1rem);
}

@media (prefers-reduced-motion: reduce) {
  .sheet-enter-active,
  .sheet-leave-active,
  .sheet-enter-active > div,
  .sheet-leave-active > div {
    transition: none;
  }
}
</style>
