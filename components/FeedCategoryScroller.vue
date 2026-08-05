<script setup lang="ts">
import type { PostCategory } from "~/types/post";
import { categoryDisplayName } from "~/utils/categoryLabel";

defineProps<{
  categories: PostCategory[];
  categoryFilter: string | null;
  loading: boolean;
}>();

const emit = defineEmits<{
  filter: [id: string | null];
}>();

const { t, te } = useI18n();

function catLabel(cat: PostCategory) {
  return categoryDisplayName(cat, t, te);
}
</script>

<template>
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
          ? 'feed-category-chip--active shadow-sm'
          : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
      "
      :disabled="loading"
      @click="emit('filter', null)"
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
          ? 'feed-category-chip--active shadow-sm'
          : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
      "
      @click="emit('filter', cat.id)"
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
</template>
