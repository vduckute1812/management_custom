<script setup lang="ts">
import type { PostReactionType } from "~/types/post";
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
const rootEl = ref<HTMLElement | null>(null);
const closeBtn = ref<HTMLButtonElement | null>(null);

const viewerOpen = computed(() => true);
useModal(viewerOpen, {
  container: rootEl,
  initialFocus: closeBtn,
  closeOnEscape: false,
});

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
    ref="rootEl"
    class="fixed inset-0 z-50 bg-slate-950/95 flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
    :aria-label="$t('feed.stories.viewerAria')"
  >
    <button
      ref="closeBtn"
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
      <StoryPlaybackControls
        :stories="group.stories"
        :current-index="storyIndex"
        :progress="progress"
        @previous="prev"
        @next="next"
      />

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

      <StoryReactionBar
        v-if="!isOwnStory"
        :my-reaction="story.myReaction"
        :reacting="reacting"
        @react="onReact"
      />

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

    <StoryInsightsPanel
      v-if="story && isOwnStory"
      :open="insightsOpen"
      :loading="insightsLoading"
      :insights="insights"
      :view-count="story.viewCount"
      :reaction-count="story.reactionCount"
      @close="closeInsights"
    />

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
