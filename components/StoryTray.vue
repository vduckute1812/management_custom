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
  <section :aria-label="$t('feed.stories.sectionAria')" class="space-y-3">
    <div class="flex items-center justify-between px-0.5">
      <div class="flex items-center gap-2">
        <span
          class="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-700"
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            class="h-4 w-4"
          >
            <path
              d="m12 3 2.2 4.8L19 10l-4.8 2.2L12 17l-2.2-4.8L5 10l4.8-2.2L12 3Z"
              stroke-linejoin="round"
            />
            <path
              d="m19 16 .8 1.8L22 19l-2.2 1.2L19 22l-.8-1.8L16 19l2.2-1.2L19 16Z"
              stroke-linejoin="round"
            />
          </svg>
        </span>
        <h2 class="text-sm font-bold text-slate-900">
          {{ $t("feed.stories.title") }}
        </h2>
      </div>
      <button
        type="button"
        class="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-50"
        @click="emit('create')"
      >
        {{ $t("feed.stories.addYours") }}
      </button>
    </div>

    <div
      v-if="loading && !groups.length"
      class="scrollbar-thin flex gap-4 overflow-x-auto pb-1 pt-1"
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
      class="scrollbar-thin flex gap-4 overflow-x-auto pb-1 pt-1"
      role="list"
    >
      <button
        type="button"
        class="group shrink-0 flex w-16 flex-col items-center gap-1.5 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        @click="emit('create')"
      >
        <span
          class="flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-brand-300 bg-brand-50 text-xl font-semibold text-brand-700 transition group-hover:scale-105 group-hover:border-brand-500"
          aria-hidden="true"
        >
          +
        </span>
        <span class="text-[10px] text-slate-500 truncate w-full text-center">
          {{ $t("feed.stories.you") }}
        </span>
      </button>

      <button
        v-for="(group, idx) in groups"
        :key="group.author.id"
        type="button"
        role="listitem"
        class="group shrink-0 flex w-16 flex-col items-center gap-1.5 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        @click="emit('open', idx)"
      >
        <span
          class="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full text-sm font-bold transition group-hover:scale-105"
          :class="
            group.hasUnseen
              ? group.author.avatarUrl
                ? 'bg-slate-200 ring-2 ring-brand-400 ring-offset-2'
                : 'bg-gradient-to-br from-brand-500 to-brand-700 text-white ring-2 ring-brand-400 ring-offset-2'
              : 'bg-slate-200 text-slate-600 ring-2 ring-slate-200 ring-offset-2'
          "
        >
          <img
            v-if="group.author.avatarUrl"
            :src="group.author.avatarUrl"
            alt=""
            class="h-full w-full object-cover"
          />
          <template v-else>
            {{ initialOf(group.author.name, group.author.email) }}
          </template>
        </span>
        <span class="text-[10px] text-slate-600 truncate w-full text-center">
          {{ labelOf(group.author.name, group.author.email) }}
        </span>
      </button>
    </div>
  </section>
</template>
