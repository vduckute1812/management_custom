<script setup lang="ts">
import type { ChatMessage, ChatMessageReactionType } from "~/types/chat";

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
const threadScroller = ref<{
  scrollToBottom: (force?: boolean) => void;
} | null>(null);
const pickerForId = ref<string | null>(null);
/** Message currently pressed (before / while picker is open) — drives hold highlight. */
const holdingId = ref<string | null>(null);
const pendingDeleteId = ref<string | null>(null);
const pickerAnchorRect = ref<{
  top: number;
  left: number;
  right: number;
  bottom: number;
} | null>(null);
const pickerMine = ref(false);
/** Snappy long-press — still above accidental tap noise. */
const LONG_PRESS_MS = 280;
const MOVE_CANCEL_PX = 10;
let longPressTimer: ReturnType<typeof setTimeout> | null = null;
let longPressFired = false;
let pressStartX = 0;
let pressStartY = 0;
let pressBubbleEl: HTMLElement | null = null;

function openPicker(messageId: string, anchor: HTMLElement | null) {
  const msg = props.messages.find((m) => m.id === messageId);
  pickerMine.value = !!msg?.mine;
  if (anchor) {
    const rect = anchor.getBoundingClientRect();
    pickerAnchorRect.value = {
      top: rect.top,
      left: rect.left,
      right: rect.right,
      bottom: rect.bottom,
    };
  }
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
  pickerAnchorRect.value = null;
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

function onReactionChipClick(
  messageId: string,
  reaction: ChatMessageReactionType,
) {
  const msg = props.messages.find((m) => m.id === messageId);
  if (msg?.myReaction === reaction) {
    emit("clearReact", messageId);
  } else {
    emit("react", messageId, reaction);
  }
}

function onPickerReact(id: string, reaction: ChatMessageReactionType) {
  emit("react", id, reaction);
}

function onPickerClearReact(id: string) {
  emit("clearReact", id);
}

function onDeleteRequest(messageId: string) {
  pendingDeleteId.value = messageId;
}

async function confirmDelete() {
  const id = pendingDeleteId.value;
  if (!id) return;
  pendingDeleteId.value = null;
  emit("delete", id);
}

function onScroll() {
  if (pickerForId.value) closePicker();
}

onMounted(() => {
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
  clearLongPress();
});

function scrollToBottom(force = false) {
  threadScroller.value?.scrollToBottom(force);
}

defineExpose({ scrollToBottom });
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <ChatMessageThreadScroller
      ref="threadScroller"
      :messages="messages"
      :has-more="hasMore"
      :loading="loading"
      :loading-more="loadingMore"
      :peer-last-read-at="peerLastReadAt"
      @load-more="emit('loadMore')"
      @scroll="onScroll"
    >
      <template #default="{ lastReadMineId }">
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
      </template>
    </ChatMessageThreadScroller>

    <ChatMessageThreadReactionPicker
      :message-id="pickerForId"
      :messages="messages"
      :anchor-rect="pickerAnchorRect"
      :mine="pickerMine"
      @react="onPickerReact"
      @clear-react="onPickerClearReact"
      @delete-request="onDeleteRequest"
      @close="closePicker"
    />

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
