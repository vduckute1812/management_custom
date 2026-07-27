<script setup lang="ts">
import "katex/dist/katex.min.css";
import type { PostFontFamily, PostTextColor } from "~/types/post";
import { POST_FONT_FAMILY_CSS, POST_TEXT_COLOR_CSS } from "~/types/post";
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
  },
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
  margin: 0.75rem 0;
  overflow-x: auto;
  overflow-y: hidden;
}

.post-body :deep(p) {
  margin: 0.5em 0;
  line-height: 1.65;
}

.post-body :deep(p:first-child) {
  margin-top: 0;
}

.post-body :deep(p:last-child) {
  margin-bottom: 0;
}

.post-body :deep(h1),
.post-body :deep(h2),
.post-body :deep(h3),
.post-body :deep(h4),
.post-body :deep(h5),
.post-body :deep(h6) {
  font-weight: 700;
  line-height: 1.3;
  margin: 1em 0 0.4em;
  color: inherit;
}

.post-body :deep(h1) {
  font-size: 1.5em;
}
.post-body :deep(h2) {
  font-size: 1.3em;
}
.post-body :deep(h3) {
  font-size: 1.15em;
}
.post-body :deep(h4),
.post-body :deep(h5),
.post-body :deep(h6) {
  font-size: 1.05em;
}

.post-body :deep(ul),
.post-body :deep(ol) {
  margin: 0.5em 0;
  padding-left: 1.4em;
}

.post-body :deep(ul) {
  list-style: disc;
}

.post-body :deep(ol) {
  list-style: decimal;
}

.post-body :deep(li) {
  margin: 0.2em 0;
  line-height: 1.55;
}

.post-body :deep(li > ul),
.post-body :deep(li > ol) {
  margin: 0.15em 0;
}

.post-body :deep(blockquote) {
  margin: 0.75em 0;
  padding: 0.35em 0 0.35em 0.9em;
  border-left: 3px solid #94a3b8;
  color: #475569;
}

.post-body :deep(hr) {
  margin: 1em 0;
  border: 0;
  border-top: 1px solid #e2e8f0;
}

.post-body :deep(a) {
  color: #1d4ed8;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.post-body :deep(a:hover) {
  color: #1e40af;
}

.post-body :deep(strong) {
  font-weight: 700;
}

.post-body :deep(em) {
  font-style: italic;
}

.post-body :deep(del) {
  text-decoration: line-through;
  opacity: 0.85;
}

.post-body :deep(code) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.88em;
  background: #f1f5f9;
  border-radius: 0.3rem;
  padding: 0.1em 0.35em;
}

.post-body :deep(pre) {
  margin: 0.75em 0;
  padding: 0.75rem 0.9rem;
  overflow-x: auto;
  background: #0f172a;
  color: #e2e8f0;
  border-radius: 0.65rem;
  font-size: 0.85em;
  line-height: 1.5;
}

.post-body :deep(pre code) {
  background: transparent;
  color: inherit;
  padding: 0;
  border-radius: 0;
  font-size: inherit;
}

.post-body :deep(.md-table-wrap) {
  display: block;
  width: 100%;
  max-width: 100%;
  margin: 0.75em 0;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.post-body :deep(table) {
  display: table;
  width: max-content;
  min-width: 100%;
  margin: 0;
  border-collapse: collapse;
  border-spacing: 0;
  font-size: 0.92em;
  table-layout: auto;
}

.post-body :deep(th),
.post-body :deep(td) {
  border: 1px solid #e2e8f0;
  padding: 0.5em 0.75em;
  vertical-align: top;
  text-align: start;
  white-space: normal;
  word-break: normal;
  overflow-wrap: anywhere;
}

.post-body :deep(th[align="left"]),
.post-body :deep(td[align="left"]) {
  text-align: left;
}

.post-body :deep(th[align="center"]),
.post-body :deep(td[align="center"]) {
  text-align: center;
}

.post-body :deep(th[align="right"]),
.post-body :deep(td[align="right"]) {
  text-align: right;
}

.post-body :deep(th) {
  background: #f8fafc;
  font-weight: 600;
}

.post-body :deep(tbody tr:nth-child(even) td) {
  background: #fafbfc;
}

.post-body :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 0.5rem;
}

html[data-theme="dark"] .post-body :deep(blockquote) {
  border-left-color: #64748b;
  color: #94a3b8;
}

html[data-theme="dark"] .post-body :deep(hr) {
  border-top-color: #334155;
}

html[data-theme="dark"] .post-body :deep(a) {
  color: #93c5fd;
}

html[data-theme="dark"] .post-body :deep(code) {
  background: #1e293b;
}

html[data-theme="dark"] .post-body :deep(pre) {
  background: #020617;
}

html[data-theme="dark"] .post-body :deep(th),
html[data-theme="dark"] .post-body :deep(td) {
  border-color: #334155;
}

html[data-theme="dark"] .post-body :deep(th) {
  background: #1e293b;
}

html[data-theme="dark"] .post-body :deep(tbody tr:nth-child(even) td) {
  background: #0f172a;
}
</style>
