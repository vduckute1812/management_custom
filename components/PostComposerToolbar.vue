<script setup lang="ts">
import type { PostCategory, PostFontFamily, PostTextColor } from "~/types/post";
import { POST_FONT_FAMILIES, POST_TEXT_COLORS } from "~/types/post";
import { categoryDisplayName } from "~/utils/categoryLabel";

defineProps<{
  categories?: PostCategory[];
  fontLabels: Record<PostFontFamily, string>;
  colorLabels: Record<PostTextColor, string>;
}>();

const emit = defineEmits<{
  (e: "insert-inline-latex"): void;
  (e: "insert-block-latex"): void;
}>();

const categoryId = defineModel<string>("categoryId", { required: true });
const fontFamily = defineModel<PostFontFamily>("fontFamily", {
  required: true,
});
const textColor = defineModel<PostTextColor>("textColor", { required: true });

const { t, te } = useI18n();

function catLabel(cat: PostCategory) {
  return categoryDisplayName(cat, t, te);
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2">
    <label class="sr-only" for="post-category">{{
      $t("feed.composer.category")
    }}</label>
    <select
      id="post-category"
      v-model="categoryId"
      class="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-200"
    >
      <option value="">
        {{ $t("feed.composer.noCategory") }}
      </option>
      <option v-for="cat in categories || []" :key="cat.id" :value="cat.id">
        {{ catLabel(cat) }}
      </option>
    </select>

    <label class="sr-only" for="post-font">{{
      $t("feed.composer.font")
    }}</label>
    <select
      id="post-font"
      v-model="fontFamily"
      class="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-200"
    >
      <option v-for="f in POST_FONT_FAMILIES" :key="f" :value="f">
        {{ fontLabels[f] }}
      </option>
    </select>

    <label class="sr-only" for="post-color">{{
      $t("feed.composer.textColor")
    }}</label>
    <select
      id="post-color"
      v-model="textColor"
      class="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-200"
    >
      <option v-for="c in POST_TEXT_COLORS" :key="c" :value="c">
        {{ colorLabels[c] }}
      </option>
    </select>

    <button
      type="button"
      class="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
      :title="$t('feed.composer.insertInlineLatex')"
      @click="emit('insert-inline-latex')"
    >
      {{ $t("feed.composer.latexInline") }}
    </button>
    <button
      type="button"
      class="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
      :title="$t('feed.composer.insertBlockLatex')"
      @click="emit('insert-block-latex')"
    >
      {{ $t("feed.composer.latexBlock") }}
    </button>
  </div>
</template>
