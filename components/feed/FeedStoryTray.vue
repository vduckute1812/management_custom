<script setup lang="ts">
import type { StoryAuthorGroup } from "~/types/story";

defineProps<{
  groups: StoryAuthorGroup[];
  loading: boolean;
}>();

const emit = defineEmits<{
  refresh: [];
}>();

const viewerOpen = ref(false);
const viewerGroupIndex = ref(0);
const storyComposerOpen = ref(false);

function openViewer(groupIndex: number) {
  viewerGroupIndex.value = groupIndex;
  viewerOpen.value = true;
}

function retry(clearError: () => void) {
  clearError();
  emit("refresh");
}
</script>

<template>
  <NuxtErrorBoundary>
    <div
      class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <StoryTray
        :groups="groups"
        :loading="loading"
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
          @click="retry(clearError)"
        >
          {{ $t("feed.retry") }}
        </button>
      </div>
    </template>
  </NuxtErrorBoundary>

  <LazyStoryViewer
    v-if="viewerOpen && groups.length"
    :groups="groups"
    :start-group-index="viewerGroupIndex"
    @close="viewerOpen = false"
  />

  <FeedStoryComposer v-model:open="storyComposerOpen" />
</template>
