<script setup lang="ts">
import type { StoryAuthorGroup } from "~/types/story";

const props = defineProps<{
  groups: StoryAuthorGroup[];
  loading?: boolean;
}>();

const emit = defineEmits<{
  (e: "open", groupIndex: number): void;
  (e: "create"): void;
}>();

function initialOf(name: string | null, email: string) {
  return (name?.trim() || email).charAt(0).toUpperCase() || "?";
}

function labelOf(name: string | null, email: string) {
  const n = name?.trim();
  if (n) return n.split(/\s+/)[0];
  return email.split("@")[0];
}
</script>

<template>
  <section aria-label="Stories" class="space-y-2">
    <div class="flex items-center justify-between px-0.5">
      <h2 class="text-sm font-semibold text-slate-800">Stories</h2>
      <button
        type="button"
        class="text-xs font-medium text-brand-700 hover:underline"
        @click="emit('create')"
      >
        Add yours
      </button>
    </div>

    <div
      v-if="loading && !groups.length"
      class="flex gap-3 overflow-x-auto pb-1"
      aria-busy="true"
    >
      <SkeletonBlock
        v-for="n in 5"
        :key="n"
        height="h-16"
        width="w-16"
        rounded="rounded-full"
        class="shrink-0"
      />
    </div>

    <div
      v-else
      class="flex gap-3 overflow-x-auto pb-1"
      role="list"
    >
      <button
        type="button"
        class="shrink-0 flex flex-col items-center gap-1 w-16 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 rounded-lg"
        @click="emit('create')"
      >
        <span
          class="h-14 w-14 rounded-full border-2 border-dashed border-slate-300 bg-white text-slate-500 flex items-center justify-center text-xl font-semibold"
          aria-hidden="true"
        >
          +
        </span>
        <span class="text-[10px] text-slate-500 truncate w-full text-center">
          You
        </span>
      </button>

      <button
        v-for="(group, idx) in groups"
        :key="group.author.id"
        type="button"
        role="listitem"
        class="shrink-0 flex flex-col items-center gap-1 w-16 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 rounded-lg"
        @click="emit('open', idx)"
      >
        <span
          class="h-14 w-14 rounded-full flex items-center justify-center text-sm font-semibold"
          :class="
            group.hasUnseen
              ? 'bg-gradient-to-br from-brand-500 to-brand-700 text-white ring-2 ring-brand-200 ring-offset-2'
              : 'bg-slate-200 text-slate-600'
          "
        >
          {{ initialOf(group.author.name, group.author.email) }}
        </span>
        <span class="text-[10px] text-slate-600 truncate w-full text-center">
          {{ labelOf(group.author.name, group.author.email) }}
        </span>
      </button>
    </div>
  </section>
</template>
