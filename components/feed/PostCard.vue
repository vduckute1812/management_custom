<script setup lang="ts">
import type { Post, PostReactionType } from "~/types/post";
import { PostFormat } from "~/types/post";
import { estimateReadingMinutes } from "~/utils/manuscript";

const props = defineProps<{
  post: Post;
}>();

const emit = defineEmits<{
  (e: "react", reaction: PostReactionType): void;
  (e: "clear-react"): void;
  (e: "delete"): void;
  (e: "share", note: string): void;
}>();

const auth = useAuth();

const localeView = ref(props.post);
watch(
  () => props.post,
  (next) => {
    localeView.value = next;
  },
);

const isManuscript = computed(
  () => localeView.value.format === PostFormat.Manuscript,
);

const readingMinutes = computed(() =>
  estimateReadingMinutes(
    localeView.value.body || "",
    localeView.value.title || "",
  ),
);

const commentsOpen = ref(false);
const shareOpen = ref(false);
const canInteract = computed(() => auth.isAuthenticated.value);

function toggleComments() {
  commentsOpen.value = !commentsOpen.value;
}

function onShareClick() {
  if (!auth.isAuthenticated.value) {
    navigateTo({ path: "/login", query: { redirect: "/feed" } });
    return;
  }
  shareOpen.value = !shareOpen.value;
}
</script>

<template>
  <article
    class="group rounded-2xl border shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md"
    :class="
      isManuscript
        ? 'manuscript-card'
        : 'border-slate-200 bg-white hover:border-slate-300'
    "
  >
    <PostCardHeader
      :post="post"
      :manuscript="isManuscript"
      :reading-minutes="readingMinutes"
      @delete="emit('delete')"
    />

    <PostCardContent :post="post" @locale-view="localeView = $event" />

    <PostCardReactions
      :reactions="post.reactions"
      :reaction-count="post.reactionCount"
      :my-reaction="post.myReaction"
      :comment-count="post.commentCount"
      :can-interact="canInteract"
      @react="emit('react', $event)"
      @clear-react="emit('clear-react')"
      @toggle-comments="toggleComments"
      @share-click="onShareClick"
    />

    <PostShareComposer
      v-if="shareOpen"
      :post-id="post.id"
      @close="shareOpen = false"
      @share="emit('share', $event)"
    />

    <PostCommentsPanel :post-id="post.id" :open="commentsOpen" />
  </article>
</template>

<style scoped>
.manuscript-card {
  position: relative;
}

.manuscript-card::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: linear-gradient(180deg, var(--mf-accent), transparent 75%);
}
</style>
