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
  <div
    class="post-body min-w-0 max-w-full text-sm break-words"
    :style="style"
    v-html="html"
  />
</template>

<!--
  Unscoped on purpose: body HTML comes from v-html.
  Do not use :deep() here — without scoped it is left as invalid CSS.
-->
<style>
.post-body {
  /* Explicit ink — avoid inheriting light dark-theme chrome colors. */
  color: #1e293b;
}

html[data-theme="dark"] .post-body {
  color: #e2e8f0;
}

/* Manuscript cards use dark paper in dark mode — inherit standard dark ink. */

.post-body .katex-display {
  margin: 0.75rem 0;
  overflow-x: auto;
  overflow-y: hidden;
}

.post-body p {
  margin: 0.5em 0;
  line-height: 1.65;
}

.post-body p:first-child {
  margin-top: 0;
}

.post-body p:last-child {
  margin-bottom: 0;
}

.post-body h1,
.post-body h2,
.post-body h3,
.post-body h4,
.post-body h5,
.post-body h6 {
  font-weight: 700;
  line-height: 1.3;
  margin: 1em 0 0.4em;
  color: inherit;
}

.post-body h1 {
  font-size: 1.5em;
}
.post-body h2 {
  font-size: 1.3em;
}
.post-body h3 {
  font-size: 1.15em;
}
.post-body h4,
.post-body h5,
.post-body h6 {
  font-size: 1.05em;
}

.post-body ul,
.post-body ol {
  margin: 0.5em 0;
  padding-left: 1.4em;
}

.post-body ul {
  list-style: disc;
}

.post-body ol {
  list-style: decimal;
}

.post-body li {
  margin: 0.2em 0;
  line-height: 1.55;
}

.post-body li > ul,
.post-body li > ol {
  margin: 0.15em 0;
}

.post-body blockquote {
  margin: 0.75em 0;
  padding: 0.35em 0 0.35em 0.9em;
  border-left: 3px solid #94a3b8;
  color: #475569;
}

.post-body hr {
  margin: 1em 0;
  border: 0;
  border-top: 1px solid #e2e8f0;
}

.post-body a {
  color: #1d4ed8;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.post-body a:hover {
  color: #1e40af;
}

.post-body strong {
  font-weight: 700;
}

.post-body em {
  font-style: italic;
}

.post-body del {
  text-decoration: line-through;
  opacity: 0.85;
}

.post-body code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.88em;
  background: #f1f5f9;
  border-radius: 0.3rem;
  padding: 0.1em 0.35em;
}

.post-body pre {
  margin: 0.75em 0;
  padding: 0.75rem 0.9rem;
  overflow-x: auto;
  background: #0f172a;
  color: #e2e8f0;
  border-radius: 0.65rem;
  font-size: 0.85em;
  line-height: 1.5;
}

.post-body pre code {
  background: transparent;
  color: inherit;
  padding: 0;
  border-radius: 0;
  font-size: inherit;
}

.post-body .md-table-wrap {
  display: block;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  margin: 0.75em 0;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  -webkit-overflow-scrolling: touch;
}

.post-body table {
  display: table;
  width: max-content;
  min-width: 100%;
  max-width: none;
  margin: 0;
  border-collapse: collapse;
  border-spacing: 0;
  font-size: 0.92em;
  table-layout: auto;
}

.post-body th,
.post-body td {
  border: 1px solid #cbd5e1;
  padding: 0.55em 0.8em;
  vertical-align: top;
  text-align: start;
  white-space: normal;
  word-break: normal;
  overflow-wrap: anywhere;
  min-width: 5.5rem;
}

.post-body th:first-child,
.post-body td:first-child {
  min-width: 7rem;
  position: sticky;
  left: 0;
  z-index: 1;
  background: #f8fafc;
}

.post-body tbody td:first-child {
  background: #fff;
}

.post-body tbody tr:nth-child(even) td:first-child {
  background: #f8fafc;
}

.post-body th[align="left"],
.post-body td[align="left"] {
  text-align: left;
}

.post-body th[align="center"],
.post-body td[align="center"] {
  text-align: center;
}

.post-body th[align="right"],
.post-body td[align="right"] {
  text-align: right;
}

.post-body th {
  background: #f1f5f9;
  font-weight: 600;
}

.post-body tbody tr:nth-child(even) td {
  background: #f8fafc;
}

.post-body table .katex-display {
  display: inline-block;
  margin: 0.35em 0;
  max-width: 100%;
  overflow-x: auto;
  text-align: left;
}

.post-body img {
  max-width: 100%;
  height: auto;
  border-radius: 0.5rem;
}

html[data-theme="dark"] .post-body blockquote {
  border-left-color: #64748b;
  color: #94a3b8;
}

html[data-theme="dark"] .post-body hr {
  border-top-color: #334155;
}

html[data-theme="dark"] .post-body a {
  color: #93c5fd;
}

html[data-theme="dark"] .post-body code {
  background: #1e293b;
}

html[data-theme="dark"] .post-body pre {
  background: #020617;
}

html[data-theme="dark"] .post-body th,
html[data-theme="dark"] .post-body td {
  border-color: #475569;
}

html[data-theme="dark"] .post-body th {
  background: #1e293b;
}

html[data-theme="dark"] .post-body th:first-child,
html[data-theme="dark"] .post-body tbody td:first-child {
  background: #1e293b;
}

html[data-theme="dark"] .post-body tbody tr:nth-child(even) td {
  background: #0f172a;
}

html[data-theme="dark"] .post-body tbody tr:nth-child(even) td:first-child {
  background: #0f172a;
}
</style>
