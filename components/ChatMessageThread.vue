<script setup lang="ts">
import type { ChatMessage, ChatMessageReactionType } from "~/types/chat";
import {
  ChatMessageReaction,
  CHAT_REACTION_EMOJI,
  CHAT_REACTION_TYPES,
} from "~/types/chat";

const props = defineProps<{
  messages: ChatMessage[];
  hasMore?: boolean;
  loading?: boolean;
  loadingMore?: boolean;
  peerLastReadAt?: string | null;
}>();

const emit = defineEmits<{
  loadMore: [];
  react: [messageId: string, reaction: ChatMessageReactionType];
  clearReact: [messageId: string];
  delete: [messageId: string];
}>();

const { t } = useI18n();
const scroller = ref<HTMLElement | null>(null);
const loadOlderSentinel = ref<HTMLElement | null>(null);
const stickToBottom = ref(true);
const pickerForId = ref<string | null>(null);
/** Message currently pressed (before / while picker is open) — drives hold highlight. */
const holdingId = ref<string | null>(null);
const pendingDeleteId = ref<string | null>(null);
const pickerStyle = ref<Record<string, string>>({});
const scrollSnapshot = ref<{ scrollHeight: number; scrollTop: number } | null>(
  null,
);
/** Snappy long-press — still above accidental tap noise. */
const LONG_PRESS_MS = 280;
const MOVE_CANCEL_PX = 10;
let longPressTimer: ReturnType<typeof setTimeout> | null = null;
let longPressFired = false;
let pressStartX = 0;
let pressStartY = 0;
let pressBubbleEl: HTMLElement | null = null;

const REACTION_LABEL = computed<Record<ChatMessageReactionType, string>>(
  () => ({
    [ChatMessageReaction.Like]: t("feed.post.reactionLike"),
    [ChatMessageReaction.Love]: t("feed.post.reactionLove"),
    [ChatMessageReaction.Haha]: t("feed.post.reactionHaha"),
    [ChatMessageReaction.Wow]: t("feed.post.reactionWow"),
    [ChatMessageReaction.Sad]: t("feed.post.reactionSad"),
    [ChatMessageReaction.Angry]: t("feed.post.reactionAngry"),
  }),
);

function isReadByPeer(msg: ChatMessage): boolean {
  if (!msg.mine) return false;
  if (typeof msg.readByPeer === "boolean") return msg.readByPeer;
  if (!props.peerLastReadAt) return false;
  return (
    new Date(msg.createdAt).getTime() <=
    new Date(props.peerLastReadAt).getTime()
  );
}

const lastReadMineId = computed(() => {
  for (let i = props.messages.length - 1; i >= 0; i--) {
    const m = props.messages[i];
    if (m?.mine && isReadByPeer(m)) return m.id;
  }
  return null;
});

function requestLoadMore() {
  if (!props.hasMore || props.loadingMore) return;
  const el = scroller.value;
  if (el) {
    scrollSnapshot.value = {
      scrollHeight: el.scrollHeight,
      scrollTop: el.scrollTop,
    };
  }
  emit("loadMore");
}

function onScroll() {
  const el = scroller.value;
  if (!el) return;
  if (pickerForId.value) closePicker();
  const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
  stickToBottom.value = dist < 48;
  if (el.scrollTop < 48 && props.hasMore && !props.loadingMore) {
    requestLoadMore();
  }
}

function scrollToBottom(force = false) {
  const el = scroller.value;
  if (!el) return;
  if (!force && !stickToBottom.value) return;
  nextTick(() => {
    el.scrollTop = el.scrollHeight;
  });
}

function restoreScrollAfterPrepend() {
  const el = scroller.value;
  const snap = scrollSnapshot.value;
  if (!el || !snap) return;
  el.scrollTop = el.scrollHeight - snap.scrollHeight + snap.scrollTop;
  scrollSnapshot.value = null;
}

watch(
  () => props.loadingMore,
  (loading, wasLoading) => {
    if (wasLoading && !loading) {
      nextTick(() => restoreScrollAfterPrepend());
    }
  },
);

watch(
  () => props.messages.length,
  (n, prev) => {
    if (scrollSnapshot.value) return;
    if (n > (prev ?? 0)) scrollToBottom();
  },
);

watch(
  () => props.loading,
  (v) => {
    if (!v) scrollToBottom(true);
  },
);

let olderObserver: IntersectionObserver | null = null;

onMounted(() => {
  if (typeof IntersectionObserver === "undefined") return;
  watch(
    [scroller, loadOlderSentinel, () => props.hasMore],
    ([root, el, hasMore]) => {
      olderObserver?.disconnect();
      olderObserver = null;
      if (!root || !el || !hasMore) return;
      olderObserver = new IntersectionObserver(
        (entries) => {
          if (!entries.some((e) => e.isIntersecting)) return;
          requestLoadMore();
        },
        { root, rootMargin: "80px 0px 0px 0px", threshold: 0 },
      );
      olderObserver.observe(el);
    },
    { immediate: true },
  );

  const onDocPointer = (ev: Event) => {
    if (!pickerForId.value) return;
    const target = ev.target as HTMLElement | null;
    if (target?.closest?.("[data-chat-react]")) return;
    closePicker();
  };
  document.addEventListener("pointerdown", onDocPointer);
  onBeforeUnmount(() => {
    document.removeEventListener("pointerdown", onDocPointer);
  });
});

onBeforeUnmount(() => {
  olderObserver?.disconnect();
  olderObserver = null;
  clearLongPress();
});

function positionPicker(anchor: HTMLElement, mine: boolean) {
  const rect = anchor.getBoundingClientRect();
  const pad = 8;
  // 6×w-10 buttons + 5×gap-0.5 + px-1.5 padding + border
  const barW = 6 * 40 + 5 * 2 + 12 + 2;
  const barH = 48;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const placeAbove = rect.top >= barH + pad + 4;
  const top = placeAbove
    ? Math.max(pad, rect.top - barH - 6)
    : Math.min(vh - barH - pad, rect.bottom + 6);

  let left: number;
  if (mine) {
    left = rect.right - barW;
  } else {
    left = rect.left;
  }
  left = Math.min(Math.max(pad, left), vw - barW - pad);

  pickerStyle.value = {
    position: "fixed",
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
    zIndex: "80",
  };
}

function openPicker(messageId: string, anchor: HTMLElement | null) {
  const msg = props.messages.find((m) => m.id === messageId);
  if (anchor) positionPicker(anchor, !!msg?.mine);
  holdingId.value = messageId;
  pickerForId.value = messageId;
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(12);
    } catch {
      /* ignore */
    }
  }
}

function closePicker() {
  pickerForId.value = null;
  holdingId.value = null;
  pressBubbleEl = null;
  pickerStyle.value = {};
}

function clearLongPress() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

function endPressWithoutPicker() {
  clearLongPress();
  if (!pickerForId.value) holdingId.value = null;
  pressBubbleEl = null;
}

function onBubblePointerDown(messageId: string, ev: PointerEvent) {
  const target = ev.target as HTMLElement | null;
  // Don't steal long-press from links, audio, or the react controls.
  if (
    target?.closest?.("a, button, audio, input, textarea, [data-chat-react]")
  ) {
    return;
  }
  longPressFired = false;
  clearLongPress();
  pressStartX = ev.clientX;
  pressStartY = ev.clientY;
  holdingId.value = messageId;
  pressBubbleEl =
    (ev.currentTarget as HTMLElement | null) ??
    (target?.closest?.("[data-chat-bubble]") as HTMLElement | null);
  longPressTimer = setTimeout(() => {
    longPressFired = true;
    openPicker(messageId, pressBubbleEl);
    longPressTimer = null;
  }, LONG_PRESS_MS);
}

function onBubblePointerMove(ev: PointerEvent) {
  if (!longPressTimer && !holdingId.value) return;
  if (pickerForId.value) return;
  const dx = ev.clientX - pressStartX;
  const dy = ev.clientY - pressStartY;
  if (dx * dx + dy * dy > MOVE_CANCEL_PX * MOVE_CANCEL_PX) {
    endPressWithoutPicker();
  }
}

function onBubblePointerUp() {
  if (!longPressFired) endPressWithoutPicker();
  else clearLongPress();
}

function onBubblePointerLeave() {
  // Don't close an open picker — the teleported bar lives outside the bubble.
  if (pickerForId.value) {
    clearLongPress();
    return;
  }
  endPressWithoutPicker();
}

function onBubblePointerCancel() {
  endPressWithoutPicker();
  if (pickerForId.value) closePicker();
}

function isMessageHighlighted(messageId: string) {
  return holdingId.value === messageId || pickerForId.value === messageId;
}

const pickerMessage = computed(() =>
  pickerForId.value
    ? (props.messages.find((m) => m.id === pickerForId.value) ?? null)
    : null,
);

function pickReaction(messageId: string, reaction: ChatMessageReactionType) {
  const msg = props.messages.find((m) => m.id === messageId);
  if (msg?.myReaction === reaction) {
    emit("clearReact", messageId);
  } else {
    emit("react", messageId, reaction);
  }
  closePicker();
}

function onReactionChipClick(
  messageId: string,
  reaction: ChatMessageReactionType,
) {
  pickReaction(messageId, reaction);
}

function requestDelete(messageId: string) {
  closePicker();
  pendingDeleteId.value = messageId;
}

async function confirmDelete() {
  const id = pendingDeleteId.value;
  if (!id) return;
  pendingDeleteId.value = null;
  emit("delete", id);
}

defineExpose({ scrollToBottom });
</script>

<template>
  <div
    ref="scroller"
    class="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4"
    @scroll="onScroll"
  >
    <div
      v-if="hasMore"
      ref="loadOlderSentinel"
      class="mb-2 flex min-h-8 items-center justify-center"
    >
      <span
        v-if="loadingMore"
        class="text-xs font-medium text-slate-400"
        aria-live="polite"
      >
        {{ t("chat.loadingOlder") }}
      </span>
      <button
        v-else
        type="button"
        class="rounded-lg px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50"
        @click="requestLoadMore"
      >
        {{ t("chat.loadOlder") }}
      </button>
    </div>

    <div v-if="loading && !messages.length" class="space-y-3" aria-busy="true">
      <SkeletonBlock height="h-10" rounded="rounded-2xl" class="ml-8 w-2/3" />
      <SkeletonBlock height="h-10" rounded="rounded-2xl" class="mr-8 w-1/2" />
      <SkeletonBlock height="h-10" rounded="rounded-2xl" class="ml-8 w-3/5" />
    </div>

    <EmptyState
      v-else-if="!messages.length"
      class="my-6"
      illustration="spark"
      :title="t('chat.threadEmpty')"
    />

    <ul v-else class="space-y-3" role="list">
      <ChatMessageBubble
        v-for="msg in messages"
        :key="msg.id"
        :message="msg"
        :highlighted="isMessageHighlighted(msg.id)"
        :show-read-receipt="msg.id === lastReadMineId"
        @bubble-pointerdown="onBubblePointerDown"
        @bubble-pointermove="onBubblePointerMove"
        @bubble-pointerup="onBubblePointerUp"
        @bubble-pointerleave="onBubblePointerLeave"
        @bubble-pointercancel="onBubblePointerCancel"
        @reaction-click="onReactionChipClick"
      />
    </ul>

    <!-- Fixed / teleported so the scroller overflow can't clip the bar -->
    <Teleport to="body">
      <div
        v-if="pickerForId && pickerMessage"
        data-chat-react
        class="pointer-events-auto"
        :style="pickerStyle"
        role="listbox"
        :aria-label="t('chat.chooseReaction')"
      >
        <div
          class="flex flex-nowrap items-center gap-0.5 rounded-full border border-slate-200 bg-white px-1.5 py-1 shadow-lg"
        >
          <button
            v-for="r in CHAT_REACTION_TYPES"
            :key="r"
            type="button"
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl leading-none transition hover:scale-110 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
            :class="
              pickerMessage.myReaction === r
                ? 'bg-brand-50 ring-1 ring-brand-200'
                : ''
            "
            :title="REACTION_LABEL[r]"
            :aria-label="REACTION_LABEL[r]"
            @click.stop="pickReaction(pickerMessage.id, r)"
          >
            {{ CHAT_REACTION_EMOJI[r] }}
          </button>
          <template v-if="pickerMessage.mine">
            <span
              class="mx-1 h-6 w-px shrink-0 bg-slate-200"
              aria-hidden="true"
            />
            <button
              type="button"
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base leading-none text-rose-500 transition hover:scale-110 hover:bg-rose-50 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-500"
              :title="t('chat.deleteMessage')"
              :aria-label="t('chat.deleteMessage')"
              @click.stop="requestDelete(pickerMessage.id)"
            >
              🗑
            </button>
          </template>
        </div>
      </div>
    </Teleport>

    <ConfirmDialog
      :open="!!pendingDeleteId"
      :title="t('chat.deleteMessage')"
      :description="t('chat.deleteConfirm')"
      :confirm-label="t('chat.deleteMessage')"
      @cancel="pendingDeleteId = null"
      @confirm="confirmDelete"
    />
  </div>
</template>
