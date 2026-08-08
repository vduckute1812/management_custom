<script setup lang="ts">
import type { PostCategory } from "~/types/post";

defineProps<{
  pipelineCategories: PostCategory[];
  canEdit: boolean;
  canDelete: boolean;
  busy: string | null;
  safeSourceUrl: string | null;
  categoryOptionLabel: (cat: PostCategory) => string;
}>();

const categoryId = defineModel<string>("categoryId", { required: true });

const emit = defineEmits<{
  useOriginal: [];
  delete: [];
}>();
</script>

<template>
  <div
    class="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap gap-4 items-end"
  >
    <label
      class="flex flex-col gap-1 text-xs text-slate-600 flex-1 min-w-[12rem]"
    >
      <span>{{ $t("adminArticles.colCategory") }}</span>
      <select
        v-model="categoryId"
        class="border border-slate-300 rounded-md px-2 py-1.5 bg-white"
        :disabled="!canEdit"
      >
        <option value="">{{ $t("adminArticles.uncategorized") }}</option>
        <option v-for="cat in pipelineCategories" :key="cat.id" :value="cat.id">
          {{ categoryOptionLabel(cat) }}
        </option>
      </select>
    </label>
    <a
      v-if="safeSourceUrl"
      :href="safeSourceUrl"
      target="_blank"
      rel="noopener noreferrer"
      class="text-xs text-sky-700 hover:underline"
    >
      {{ $t("adminArticles.openSource") }}
    </a>
    <span v-else class="text-xs text-slate-400">{{
      $t("adminArticles.unsafeSourceUrl")
    }}</span>
    <button
      v-if="canEdit"
      type="button"
      class="text-xs text-slate-600 hover:underline"
      :disabled="!!busy"
      @click="emit('useOriginal')"
    >
      {{ $t("adminArticles.useOriginal") }}
    </button>
    <button
      v-if="canDelete"
      type="button"
      class="text-xs text-rose-600 hover:underline"
      :disabled="!!busy"
      @click="emit('delete')"
    >
      {{ $t("adminArticles.deleteForever") }}
    </button>
  </div>
</template>
