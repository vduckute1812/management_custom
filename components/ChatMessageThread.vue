<script setup lang="ts">
import type { ChatMessage, ChatMessageReactionType } from "~/types/chat";
import {
  ChatMessageKind,
  ChatMessageReaction,
  CHAT_REACTION_EMOJI,
  CHAT_REACTION_TYPES,
  getChatSticker,
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
}>();

const { t, locale } = useI18n();
const scroller = ref<HTMLElement | null>(null);
const loadOlderSentinel = ref<HTMLElement | null>(null);
const stickToBottom = ref(true);
const pickerForId = ref<string | null>(null);
/** Message currently pressed (before / while picker is open) — drives hold highlight. */
const holdingId = ref<string | null>(null);
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

function formatTime(iso: string) {
  try {
    return new Intl.DateTimeFormat(locale.value, {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatDuration(ms: number | null | undefined) {
  const total = Math.max(0, Math.round((ms ?? 0) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function stickerEmoji(id: string | null) {
  if (!id) return "❓";
  return getChatSticker(id)?.emoji ?? "❓";
}

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
    if (m.mine && isReadByPeer(m)) return m.id;
  }
  return null;
});

function isMediaBubble(msg: ChatMessage) {
  return (
    msg.kind === ChatMessageKind.Sticker ||
    msg.kind === ChatMessageKind.Emoji ||
    msg.kind === ChatMessageKind.Image ||
    msg.kind === ChatMessageKind.Audio
  );
}

function topReactions(msg: ChatMessage) {
  return CHAT_REACTION_TYPES.filter((k) => (msg.reactions?.[k] ?? 0) > 0).map(
    (k) => ({
      type: k,
      count: msg.reactions[k],
      emoji: CHAT_REACTION_EMOJI[k],
    }),
  );
}

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
    ? props.messages.find((m) => m.id === pickerForId.value) ?? null
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
      aria-hidden="true"
    >
      <span v-if="loadingMore" class="text-xs font-medium text-slate-400">
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

    <p
      v-else-if="!messages.length"
      class="py-12 text-center text-sm text-slate-500"
    >
      {{ t("chat.threadEmpty") }}
    </p>

    <ul v-else class="space-y-3" role="list">
      <li
        v-for="msg in messages"
        :key="msg.id"
        class="flex"
        :class="msg.mine ? 'justify-end' : 'justify-start'"
      >
        <div class="relative max-w-[85%] sm:max-w-[70%]">
          <div
            data-chat-bubble
            class="relative touch-manipulation select-none transition-[filter,box-shadow,background-color,transform] duration-150 [-webkit-touch-callout:none] motion-reduce:transition-none"
            :class="[
              isMediaBubble(msg)
                ? 'rounded-2xl px-0.5 py-0.5'
                : msg.mine
                  ? 'rounded-2xl rounded-br-md bg-brand-600 px-3 py-2 text-white'
                  : 'rounded-2xl rounded-bl-md bg-slate-100 px-3 py-2 text-slate-800',
              isMessageHighlighted(msg.id)
                ? isMediaBubble(msg)
                  ? 'scale-[0.98] bg-brand-100/80 ring-2 ring-brand-400 ring-offset-2 ring-offset-white'
                  : msg.mine
                    ? 'scale-[0.98] bg-brand-700 shadow-md ring-2 ring-brand-300 ring-offset-2 ring-offset-white'
                    : 'scale-[0.98] bg-brand-100 text-slate-900 shadow-md ring-2 ring-brand-400 ring-offset-2 ring-offset-white'
                : '',
            ]"
            @pointerdown="onBubblePointerDown(msg.id, $event)"
            @pointermove="onBubblePointerMove"
            @pointerup="onBubblePointerUp"
            @pointerleave="onBubblePointerLeave"
            @pointercancel="onBubblePointerCancel"
            @contextmenu.prevent
          >
            <template v-if="msg.kind === ChatMessageKind.Sticker">
              <span
                class="inline-block select-none text-5xl leading-none drop-shadow-sm"
                role="img"
                :aria-label="t('chat.stickerPreview')"
              >
                {{ stickerEmoji(msg.stickerId) }}
              </span>
            </template>
            <template v-else-if="msg.kind === ChatMessageKind.Emoji">
              <span class="inline-block select-none text-4xl leading-none">
                {{ msg.body }}
              </span>
            </template>
            <template v-else-if="msg.kind === ChatMessageKind.Image">
              <a
                v-if="msg.attachment?.url"
                :href="msg.attachment.url"
                target="_blank"
                rel="noopener noreferrer"
                class="block overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
              >
                <img
                  :src="msg.attachment.url"
                  :alt="msg.attachment.fileName || t('chat.imagePreview')"
                  class="max-h-72 w-full object-contain"
                  loading="lazy"
                />
              </a>
              <p v-else class="text-sm text-slate-500">
                {{ t("chat.imageUnavailable") }}
              </p>
            </template>
            <template v-else-if="msg.kind === ChatMessageKind.Audio">
              <div
                class="min-w-[12rem] rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2"
                :class="msg.mine ? 'border-brand-200 bg-brand-50' : ''"
              >
                <p class="mb-1 text-[11px] font-medium text-slate-500">
                  {{ t("chat.voiceNote") }}
                  <span v-if="msg.durationMs" class="tabular-nums">
                    · {{ formatDuration(msg.durationMs) }}
                  </span>
                </p>
                <audio
                  v-if="msg.attachment?.url"
                  controls
                  preload="metadata"
                  class="w-full max-w-xs"
                  :src="msg.attachment.url"
                >
                  {{ t("chat.audioUnsupported") }}
                </audio>
                <p v-else class="text-sm text-slate-500">
                  {{ t("chat.audioUnavailable") }}
                </p>
              </div>
            </template>
            <template v-else>
              <p
                class="whitespace-pre-wrap break-words text-sm leading-relaxed"
              >
                {{ msg.body }}
              </p>
            </template>
            <div
              class="mt-1 flex items-center gap-1.5 text-[10px]"
              :class="
                msg.mine && msg.kind === ChatMessageKind.Text
                  ? 'justify-end text-brand-100'
                  : msg.mine
                    ? 'justify-end text-slate-400'
                    : 'text-slate-400'
              "
            >
              <span>{{ formatTime(msg.createdAt) }}</span>
              <span
                v-if="msg.mine && msg.id === lastReadMineId"
                class="font-medium"
                :class="
                  msg.kind === ChatMessageKind.Text
                    ? 'text-brand-50'
                    : 'text-brand-600'
                "
              >
                · {{ t("chat.readReceipt") }}
              </span>
            </div>

          </div>

          <!-- Existing reaction chips only (no always-on React button) -->
          <div
            v-if="topReactions(msg).length"
            data-chat-react
            class="mt-1 flex flex-wrap items-center gap-1"
            :class="msg.mine ? 'justify-end' : 'justify-start'"
          >
            <button
              v-for="r in topReactions(msg)"
              :key="r.type"
              type="button"
              class="inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[11px] leading-none transition"
              :class="
                msg.myReaction === r.type
                  ? 'border-brand-300 bg-brand-50 text-brand-800'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              "
              :title="REACTION_LABEL[r.type]"
              :aria-label="REACTION_LABEL[r.type]"
              :aria-pressed="msg.myReaction === r.type"
              @click="onReactionChipClick(msg.id, r.type)"
            >
              <span aria-hidden="true">{{ r.emoji }}</span>
              <span v-if="r.count > 1" class="tabular-nums">{{ r.count }}</span>
            </button>
          </div>
        </div>
      </li>
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
          class="flex flex-nowrap gap-0.5 rounded-full border border-slate-200 bg-white px-1.5 py-1 shadow-lg"
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
        </div>
      </div>
    </Teleport>
  </div>
</template>
