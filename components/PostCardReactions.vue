<script setup lang="ts">
import type { PostReactionType } from "~/types/post";
import {
  POST_REACTION_TYPES,
  REACTION_EMOJI,
  ReactionType,
} from "~/types/post";
import { REACTION_I18N_KEY } from "~/types/reaction";

const props = defineProps<{
  reactions: Record<PostReactionType, number>;
  reactionCount: number;
  myReaction: PostReactionType | null;
  commentCount: number;
  canInteract: boolean;
}>();

const emit = defineEmits<{
  (e: "react", reaction: PostReactionType): void;
  (e: "clear-react"): void;
  (e: "toggle-comments"): void;
  (e: "share-click"): void;
}>();

const { t } = useI18n();

const pickerOpen = ref(false);
const reactRoot = ref<HTMLElement | null>(null);
/** Coarse pointers can't hover — click toggles the picker instead of liking. */
const touchLike = ref(false);
let removeDocPointerListener: (() => void) | null = null;

onMounted(() => {
  touchLike.value = window.matchMedia("(hover: none)").matches;
  if (!touchLike.value) return;
  // Close the mobile reaction bar when tapping outside it.
  const onDocPointer = (e: Event) => {
    if (!pickerOpen.value) return;
    const root = reactRoot.value;
    const target = e.target as Node | null;
    if (root && target && root.contains(target)) return;
    pickerOpen.value = false;
  };
  document.addEventListener("pointerdown", onDocPointer, true);
  removeDocPointerListener = () => {
    document.removeEventListener("pointerdown", onDocPointer, true);
  };
});

onBeforeUnmount(() => {
  removeDocPointerListener?.();
});

const REACTION_LABEL = computed<Record<PostReactionType, string>>(() => ({
  [ReactionType.Like]: t(`feed.post.${REACTION_I18N_KEY[ReactionType.Like]}`),
  [ReactionType.Love]: t(`feed.post.${REACTION_I18N_KEY[ReactionType.Love]}`),
  [ReactionType.Haha]: t(`feed.post.${REACTION_I18N_KEY[ReactionType.Haha]}`),
  [ReactionType.Wow]: t(`feed.post.${REACTION_I18N_KEY[ReactionType.Wow]}`),
  [ReactionType.Sad]: t(`feed.post.${REACTION_I18N_KEY[ReactionType.Sad]}`),
  [ReactionType.Angry]: t(`feed.post.${REACTION_I18N_KEY[ReactionType.Angry]}`),
}));

const topReactions = computed(() =>
  POST_REACTION_TYPES.filter((k) => (props.reactions?.[k] ?? 0) > 0).map(
    (k) => ({
      type: k,
      count: props.reactions[k],
      emoji: REACTION_EMOJI[k],
    }),
  ),
);

function ensureCanInteract() {
  if (props.canInteract) return true;
  navigateTo({ path: "/login", query: { redirect: "/feed" } });
  return false;
}

function onReactClick() {
  if (!ensureCanInteract()) return;
  // Touch devices: open/close the picker (can't hover). Desktop: quick
  // click toggles like / clears the current reaction.
  if (touchLike.value) {
    pickerOpen.value = !pickerOpen.value;
    return;
  }
  if (props.myReaction != null) {
    emit("clear-react");
  } else {
    emit("react", ReactionType.Like);
  }
}

function pickReaction(r: PostReactionType) {
  if (!ensureCanInteract()) return;
  if (props.myReaction === r) {
    emit("clear-react");
  } else {
    emit("react", r);
  }
  pickerOpen.value = false;
}

function onReactPointerEnter() {
  if (!touchLike.value) pickerOpen.value = true;
}

function onReactPointerLeave(e: MouseEvent | FocusEvent) {
  if (touchLike.value) return;
  const next = (e as FocusEvent).relatedTarget as Node | null;
  const root = e.currentTarget as Node | null;
  if (next && root?.contains(next)) return;
  pickerOpen.value = false;
}
</script>

<template>
  <div>
    <div
      class="flex items-center justify-between px-4 py-2 text-[11px] tabular-nums text-slate-500 sm:px-5"
    >
      <span class="inline-flex items-center gap-1">
        <template v-if="topReactions.length">
          <span
            v-for="r in topReactions"
            :key="r.type"
            :title="REACTION_LABEL[r.type]"
            >{{ r.emoji }}</span
          >
          <span>{{ reactionCount }}</span>
        </template>
        <template v-else>{{ $t("feed.post.zeroReactions") }}</template>
      </span>
      <span>
        {{ t("feed.post.comments", { count: commentCount }, commentCount) }}
      </span>
    </div>

    <div
      ref="reactRoot"
      class="relative grid grid-cols-3 border-t border-slate-100 bg-slate-50/40 px-1 py-1"
    >
      <div
        class="relative"
        @mouseenter="onReactPointerEnter"
        @mouseleave="onReactPointerLeave"
        @focusin="onReactPointerEnter"
        @focusout="onReactPointerLeave"
      >
        <button
          type="button"
          class="flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition sm:text-sm"
          :class="
            myReaction != null
              ? 'text-brand-700 bg-brand-50/40'
              : 'text-slate-600 hover:bg-slate-50'
          "
          :aria-pressed="myReaction != null"
          :aria-expanded="pickerOpen"
          @click="onReactClick"
        >
          <span class="text-base" aria-hidden="true">
            {{ myReaction != null ? REACTION_EMOJI[myReaction] : "👍" }}
          </span>
          {{
            myReaction != null
              ? REACTION_LABEL[myReaction]
              : $t("feed.post.react")
          }}
        </button>
        <!--
          Left-aligned (not centered on the React column) so the 6-emoji bar
          stays inside the card on narrow phones. pb-1 is a hover bridge so
          the pointer can travel from the button into the picker.
        -->
        <div
          v-if="pickerOpen"
          class="absolute bottom-full left-0 z-20 w-max pb-1"
          role="listbox"
          :aria-label="$t('feed.post.chooseReaction')"
        >
          <div
            class="flex flex-nowrap gap-0.5 rounded-full border border-slate-200 bg-white px-1.5 py-1 shadow-md"
          >
            <button
              v-for="r in POST_REACTION_TYPES"
              :key="r"
              type="button"
              class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg leading-none hover:scale-110 transition motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
              :title="REACTION_LABEL[r]"
              :aria-label="REACTION_LABEL[r]"
              @click.stop="pickReaction(r)"
            >
              {{ REACTION_EMOJI[r] }}
            </button>
          </div>
        </div>
      </div>
      <button
        type="button"
        class="flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold text-slate-600 transition hover:bg-white hover:text-slate-900 hover:shadow-sm sm:text-sm"
        @click="emit('toggle-comments')"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="hidden h-4 w-4 sm:block"
          aria-hidden="true"
        >
          <path
            d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8Z"
            stroke-linejoin="round"
          />
        </svg>
        {{ $t("feed.post.comment") }}
      </button>
      <button
        type="button"
        class="flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold text-slate-600 transition hover:bg-white hover:text-slate-900 hover:shadow-sm sm:text-sm"
        @click="emit('share-click')"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="hidden h-4 w-4 sm:block"
          aria-hidden="true"
        >
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="m8.7 10.7 6.6-4.4M8.7 13.3l6.6 4.4" />
        </svg>
        {{ $t("feed.post.share") }}
      </button>
    </div>
  </div>
</template>
