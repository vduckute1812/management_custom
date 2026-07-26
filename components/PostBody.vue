<script setup lang="ts">
import "katex/dist/katex.min.css";
import type { PostFontFamily, PostTextColor } from "~/types/post";
import {
  POST_FONT_FAMILY_CSS,
  POST_TEXT_COLOR_CSS,
} from "~/types/post";
import { renderPostBodyHtml } from "~/utils/renderPostBody";

const props = withDefaults(
  defineProps<{
    body: string;
    fontFamily?: PostFontFamily;
    textColor?: PostTextColor;
  }>(),
  {
    fontFamily: "default",
    textColor: "default",
  }
);

const html = computed(() => renderPostBodyHtml(props.body));

const style = computed(() => ({
  fontFamily: POST_FONT_FAMILY_CSS[props.fontFamily] || "inherit",
  color: POST_TEXT_COLOR_CSS[props.textColor] || "inherit",
}));
</script>

<template>
  <div
    class="post-body text-sm text-slate-800 break-words"
    :style="style"
    v-html="html"
  />
</template>

<style>
.post-body :deep(.katex-display) {
  margin: 0.5rem 0;
  overflow-x: auto;
  overflow-y: hidden;
}
</style>
