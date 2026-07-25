<script setup lang="ts">
import type { StoryAuthorGroup } from "~/types/story";

const props = defineProps<{
  groups: StoryAuthorGroup[];
  startGroupIndex: number;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const { markViewed, removeStory } = useStories();
const { mediaUrl } = useMediaUrl();

const groupIndex = ref(props.startGroupIndex);
const storyIndex = ref(0);
const progress = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;
const STORY_MS = 5000;

const group = computed(() => props.groups[groupIndex.value] ?? null);
const story = computed(() => group.value?.stories[storyIndex.value] ?? null);

function clearTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

async function startTimer() {
  clearTimer();
  progress.value = 0;
  if (!story.value) return;
  if (!story.value.viewedByMe) {
    try {
      await markViewed(story.value.id);
    } catch {
      // non-fatal
    }
  }
  const started = Date.now();
  timer = setInterval(() => {
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

async function onDelete() {
  if (!story.value?.canDelete) return;
  const id = story.value.id;
  clearTimer();
  await removeStory(id);
  emit("close");
}

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") emit("close");
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
  }
);
</script>

<template>
  <div
    class="fixed inset-0 z-50 bg-slate-950/95 flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
    aria-label="Story viewer"
  >
    <button
      type="button"
      class="absolute top-4 right-4 text-white/80 hover:text-white text-sm"
      @click="emit('close')"
    >
      Close
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

      <div class="absolute inset-x-0 top-3 z-10 px-3 pt-3 flex items-center justify-between">
        <p class="text-sm font-semibold truncate">
          {{ group.author.name || group.author.email }}
        </p>
        <button
          v-if="story.canDelete"
          type="button"
          class="text-xs text-white/70 hover:text-rose-300"
          @click="onDelete"
        >
          Delete
        </button>
      </div>

      <button
        type="button"
        class="absolute inset-y-0 left-0 w-1/3 z-[5]"
        aria-label="Previous"
        @click="prev"
      />
      <button
        type="button"
        class="absolute inset-y-0 right-0 w-1/3 z-[5]"
        aria-label="Next"
        @click="next"
      />

      <div class="absolute inset-0 flex items-center justify-center p-6 pt-14">
        <img
          v-if="story.mediaUrl && story.mime?.startsWith('image/')"
          :src="mediaUrl(story.mediaUrl)"
          :alt="story.body || 'Story media'"
          width="400"
          height="711"
          class="max-h-full max-w-full object-contain"
        />
        <p
          v-if="story.body"
          class="text-center text-lg font-medium leading-relaxed whitespace-pre-wrap"
          :class="story.mediaUrl ? 'absolute bottom-8 inset-x-6 drop-shadow' : ''"
        >
          {{ story.body }}
        </p>
      </div>
    </div>
  </div>
</template>
