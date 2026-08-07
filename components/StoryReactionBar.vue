<script setup lang="ts">
import type { PostReactionType } from "~/types/post";
import {
  POST_REACTION_TYPES,
  REACTION_EMOJI,
  ReactionType,
} from "~/types/post";
import { REACTION_I18N_KEY } from "~/types/reaction";

defineProps<{
  myReaction: PostReactionType | null;
  reacting: boolean;
}>();

const emit = defineEmits<{
  (e: "react", reaction: PostReactionType): void;
}>();

const { t } = useI18n();

const reactionLabel = computed<Record<PostReactionType, string>>(() => ({
  [ReactionType.Like]: t(`feed.post.${REACTION_I18N_KEY[ReactionType.Like]}`),
  [ReactionType.Love]: t(`feed.post.${REACTION_I18N_KEY[ReactionType.Love]}`),
  [ReactionType.Haha]: t(`feed.post.${REACTION_I18N_KEY[ReactionType.Haha]}`),
  [ReactionType.Wow]: t(`feed.post.${REACTION_I18N_KEY[ReactionType.Wow]}`),
  [ReactionType.Sad]: t(`feed.post.${REACTION_I18N_KEY[ReactionType.Sad]}`),
  [ReactionType.Angry]: t(`feed.post.${REACTION_I18N_KEY[ReactionType.Angry]}`),
}));
</script>

<template>
  <div
    class="absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-center justify-center gap-1 p-3 bg-gradient-to-t from-black/60 to-transparent"
  >
    <button
      v-for="reaction in POST_REACTION_TYPES"
      :key="reaction"
      type="button"
      class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl leading-none transition hover:scale-110 motion-reduce:transition-none"
      :class="
        myReaction === reaction
          ? 'bg-white/25 ring-1 ring-white/50'
          : 'bg-white/10 hover:bg-white/20'
      "
      :aria-label="reactionLabel[reaction]"
      :disabled="reacting"
      @click.stop="emit('react', reaction)"
    >
      {{ REACTION_EMOJI[reaction] }}
    </button>
  </div>
</template>
