<script setup lang="ts">
import type { PostAuthor } from "~/types/post";

defineProps<{
  audience: PostAuthor[];
  results: PostAuthor[];
  searching: boolean;
}>();

const emit = defineEmits<{
  (e: "pick", user: PostAuthor): void;
  (e: "remove", id: string): void;
}>();

const audienceQuery = defineModel<string>({ required: true });
</script>

<template>
  <div class="space-y-2 rounded-lg border border-slate-100 bg-slate-50/80 p-3">
    <label
      class="block text-xs font-medium text-slate-600"
      for="audience-search"
    >
      {{ $t("feed.composer.shareWith") }}
    </label>
    <div v-if="audience.length" class="flex flex-wrap gap-1.5">
      <span
        v-for="u in audience"
        :key="u.id"
        class="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-800"
      >
        {{ u.name || u.email }}
        <button
          type="button"
          class="text-brand-600 hover:text-rose-600"
          :aria-label="
            $t('feed.composer.removePerson', { name: u.name || u.email })
          "
          @click="emit('remove', u.id)"
        >
          ×
        </button>
      </span>
    </div>
    <input
      id="audience-search"
      v-model="audienceQuery"
      type="search"
      autocomplete="off"
      class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200"
      :placeholder="$t('feed.composer.searchPeople')"
      aria-describedby="audience-hint"
    />
    <p id="audience-hint" class="sr-only">
      {{ $t("feed.composer.audienceHint") }}
    </p>
    <ul
      v-if="audienceQuery.trim() && (searching || results.length)"
      class="max-h-40 overflow-auto rounded-lg border border-slate-200 bg-white divide-y divide-slate-100"
      role="listbox"
    >
      <li v-if="searching" class="px-3 py-2 text-xs text-slate-400">
        {{ $t("feed.composer.searching") }}
      </li>
      <li
        v-for="u in results.filter((r) => !audience.some((a) => a.id === r.id))"
        :key="u.id"
      >
        <button
          type="button"
          class="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"
          role="option"
          @click="emit('pick', u)"
        >
          <span class="font-medium text-slate-800">{{
            u.name || u.email
          }}</span>
          <span v-if="u.name" class="block text-[11px] text-slate-500">{{
            u.email
          }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>
