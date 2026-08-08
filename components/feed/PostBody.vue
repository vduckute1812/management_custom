<script setup lang="ts">
import type { PostFontFamily, PostTextColor } from "~/types/post";
import { POST_FONT_FAMILY_CSS, POST_TEXT_COLOR_CSS } from "~/types/post";
import { renderPostBody } from "~/utils/renderPostBody";
import { withUploadAccessTokens } from "~/utils/markdownMedia";

const props = withDefaults(
  defineProps<{
    body: string;
    fontFamily?: PostFontFamily;
    textColor?: PostTextColor;
  }>(),
  {
    fontFamily: "default",
    textColor: "default",
  },
);

const { mediaUrl } = useMediaUrl();

// Cache sanitized HTML by body text. Media URLs no longer embed access
// tokens (cookie auth), so token refresh must not re-parse markdown/KaTeX.
const renderedByBody = new Map<string, string>();

const html = ref("");

async function render(body: string) {
  let sanitized = renderedByBody.get(body);
  if (sanitized == null) {
    sanitized = await renderPostBody(body);
    // Bound the cache — feed scroll can visit many unique bodies.
    if (renderedByBody.size > 200) {
      const oldest = renderedByBody.keys().next().value;
      if (oldest != null) renderedByBody.delete(oldest);
    }
    renderedByBody.set(body, sanitized);
  }
  if (props.body !== body) return;
  html.value = withUploadAccessTokens(sanitized, mediaUrl);
}

await render(props.body);
watch(
  () => props.body,
  (body) => {
    void render(body);
  },
);

const style = computed(() => {
  const out: Record<string, string> = {};
  if (props.fontFamily !== "default") {
    const ff = POST_FONT_FAMILY_CSS[props.fontFamily];
    if (ff && ff !== "inherit") out.fontFamily = ff;
  }
  // Never set color: inherit inline — it overrides Tailwind utility classes.
  if (props.textColor !== "default") {
    out.color = POST_TEXT_COLOR_CSS[props.textColor];
  }
  return out;
});
</script>

<template>
  <!-- eslint-disable vue/no-v-html -- renderPostBody sanitizes this HTML with DOMPurify. -->
  <div
    class="post-body min-w-0 max-w-full text-sm break-words"
    :style="style"
    v-html="html"
  />
  <!-- eslint-enable vue/no-v-html -->
</template>

<!--
  Unscoped on purpose: body HTML comes from v-html.
  Do not use :deep() here — without scoped it is left as invalid CSS.
-->
<style src="./PostBody.css"></style>
