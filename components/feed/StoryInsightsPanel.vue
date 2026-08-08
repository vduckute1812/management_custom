<script setup lang="ts">
import type { PostReactionType } from "~/types/post";
import {
  POST_REACTION_TYPES,
  REACTION_EMOJI,
  ReactionType,
} from "~/types/post";
import { REACTION_I18N_KEY } from "~/types/reaction";
import type { StoryInsights } from "~/types/story";

const props = defineProps<{
  open: boolean;
  loading: boolean;
  insights: StoryInsights | null;
  viewCount: number;
  reactionCount: number;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const { t } = useI18n();
const root = ref<HTMLElement | null>(null);
const open = toRef(props, "open");

useModal(open, {
  container: root,
  onClose: () => emit("close"),
});

const reactionLabel = computed<Record<PostReactionType, string>>(() => ({
  [ReactionType.Like]: t(`feed.post.${REACTION_I18N_KEY[ReactionType.Like]}`),
  [ReactionType.Love]: t(`feed.post.${REACTION_I18N_KEY[ReactionType.Love]}`),
  [ReactionType.Haha]: t(`feed.post.${REACTION_I18N_KEY[ReactionType.Haha]}`),
  [ReactionType.Wow]: t(`feed.post.${REACTION_I18N_KEY[ReactionType.Wow]}`),
  [ReactionType.Sad]: t(`feed.post.${REACTION_I18N_KEY[ReactionType.Sad]}`),
  [ReactionType.Angry]: t(`feed.post.${REACTION_I18N_KEY[ReactionType.Angry]}`),
}));

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="sheet">
      <div
        v-if="open"
        ref="root"
        class="fixed inset-0 z-[60] flex items-end justify-center bg-slate-950/50 sm:items-center"
        role="dialog"
        aria-modal="true"
        :aria-label="$t('feed.stories.insightsAria')"
        @click.self="emit('close')"
      >
        <div
          class="w-full max-w-md max-h-[75vh] overflow-hidden rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl flex flex-col"
        >
          <div
            class="flex items-center justify-between border-b border-slate-200 px-4 py-3"
          >
            <div>
              <p class="text-sm font-semibold text-slate-900">
                {{ $t("feed.stories.myStory") }}
              </p>
              <p class="text-xs text-slate-500">
                {{
                  $t("feed.stories.viewsReactions", {
                    views: insights?.viewCount ?? viewCount,
                    reactions: insights?.reactionCount ?? reactionCount,
                  })
                }}
              </p>
            </div>
            <button
              type="button"
              class="text-sm text-slate-500 hover:text-slate-800 px-2 py-1"
              @click="emit('close')"
            >
              {{ $t("feed.stories.close") }}
            </button>
          </div>

          <div class="overflow-y-auto flex-1 px-4 py-3 space-y-5">
            <div v-if="loading" class="space-y-2" aria-busy="true">
              <SkeletonBlock height="h-10" rounded="rounded-lg" />
              <SkeletonBlock height="h-10" rounded="rounded-lg" />
            </div>

            <template v-else-if="insights">
              <section>
                <h3
                  class="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2"
                >
                  {{ $t("feed.stories.viewers") }}
                </h3>
                <ul v-if="insights.viewers.length" class="space-y-2">
                  <li
                    v-for="viewer in insights.viewers"
                    :key="viewer.user.id"
                    class="flex items-center gap-3"
                  >
                    <UserAvatar
                      :name="viewer.user.name"
                      :email="viewer.user.email"
                      :avatar-url="viewer.user.avatarUrl"
                      size="md"
                    />
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-sm font-medium text-slate-800">
                        {{ viewer.user.name || viewer.user.email }}
                      </p>
                      <p class="text-[11px] text-slate-400">
                        {{ formatWhen(viewer.viewedAt) }}
                      </p>
                    </div>
                    <span
                      v-if="viewer.reaction != null"
                      class="text-base"
                      :title="reactionLabel[viewer.reaction]"
                    >
                      {{ REACTION_EMOJI[viewer.reaction] }}
                    </span>
                  </li>
                </ul>
                <p v-else class="text-sm text-slate-500">
                  {{ $t("feed.stories.noViewsYet") }}
                </p>
              </section>

              <section>
                <h3
                  class="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2"
                >
                  {{ $t("feed.stories.reactions") }}
                </h3>
                <div
                  v-if="insights.reactionCount"
                  class="flex flex-wrap gap-2 mb-3"
                >
                  <span
                    v-for="reaction in POST_REACTION_TYPES.filter(
                      (type) => (insights?.reactions[type] ?? 0) > 0,
                    )"
                    :key="reaction"
                    class="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                  >
                    {{ REACTION_EMOJI[reaction] }}
                    {{ insights.reactions[reaction] }}
                  </span>
                </div>
                <ul v-if="insights.reactionUsers.length" class="space-y-2">
                  <li
                    v-for="reactionUser in insights.reactionUsers"
                    :key="`${reactionUser.user.id}-${reactionUser.reaction}`"
                    class="flex items-center gap-3"
                  >
                    <span class="text-base">{{
                      REACTION_EMOJI[reactionUser.reaction]
                    }}</span>
                    <div class="min-w-0 flex-1">
                      <p class="truncate text-sm font-medium text-slate-800">
                        {{ reactionUser.user.name || reactionUser.user.email }}
                      </p>
                      <p class="text-[11px] text-slate-400">
                        {{ formatWhen(reactionUser.createdAt) }}
                      </p>
                    </div>
                  </li>
                </ul>
                <p v-else class="text-sm text-slate-500">
                  {{ $t("feed.stories.noReactionsYet") }}
                </p>
              </section>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.sheet-enter-active,
.sheet-leave-active {
  transition: opacity 0.2s ease;
}
.sheet-enter-active > div,
.sheet-leave-active > div {
  transition: transform 0.2s ease;
}
.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}
.sheet-enter-from > div,
.sheet-leave-to > div {
  transform: translateY(1rem);
}

@media (prefers-reduced-motion: reduce) {
  .sheet-enter-active,
  .sheet-leave-active,
  .sheet-enter-active > div,
  .sheet-leave-active > div {
    transition: none;
  }
}
</style>
