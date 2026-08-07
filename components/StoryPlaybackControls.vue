<script setup lang="ts">
import type { Story } from "~/types/story";

defineProps<{
  stories: Story[];
  currentIndex: number;
  progress: number;
}>();

const emit = defineEmits<{
  (e: "previous"): void;
  (e: "next"): void;
}>();
</script>

<template>
  <div class="absolute inset-x-0 top-0 z-10 flex gap-1 p-2">
    <div
      v-for="(story, index) in stories"
      :key="story.id"
      class="h-0.5 flex-1 rounded-full bg-white/30 overflow-hidden"
    >
      <div
        class="h-full bg-white transition-[width] duration-75 ease-linear motion-reduce:transition-none"
        :style="{
          width:
            index < currentIndex
              ? '100%'
              : index === currentIndex
                ? `${progress}%`
                : '0%',
        }"
      />
    </div>
  </div>

  <button
    type="button"
    class="absolute inset-y-0 left-0 w-1/3 z-[5]"
    :aria-label="$t('feed.stories.previous')"
    @click="emit('previous')"
  />
  <button
    type="button"
    class="absolute inset-y-0 right-0 w-1/3 z-[5]"
    :aria-label="$t('feed.stories.next')"
    @click="emit('next')"
  />
</template>
