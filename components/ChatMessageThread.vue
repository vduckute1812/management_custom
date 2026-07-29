<script setup lang="ts">
import type { ChatMessage } from "~/types/chat";
import { ChatMessageKind, getChatSticker } from "~/types/chat";

const props = defineProps<{
  messages: ChatMessage[];
  hasMore?: boolean;
  loading?: boolean;
  loadingMore?: boolean;
  peerLastReadAt?: string | null;
}>();

const emit = defineEmits<{
  loadMore: [];
}>();

const { t, locale } = useI18n();
const scroller = ref<HTMLElement | null>(null);
const stickToBottom = ref(true);

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

function onScroll() {
  const el = scroller.value;
  if (!el) return;
  const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
  stickToBottom.value = dist < 48;
  if (el.scrollTop < 40 && props.hasMore && !props.loadingMore) {
    emit("loadMore");
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

watch(
  () => props.messages.length,
  (n, prev) => {
    if (n > (prev ?? 0)) scrollToBottom();
  },
);

watch(
  () => props.loading,
  (v) => {
    if (!v) scrollToBottom(true);
  },
);

defineExpose({ scrollToBottom });
</script>

<template>
  <div
    ref="scroller"
    class="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4"
    @scroll="onScroll"
  >
    <div v-if="hasMore" class="mb-3 flex justify-center">
      <button
        type="button"
        class="rounded-lg px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
        :disabled="loadingMore"
        @click="emit('loadMore')"
      >
        {{ loadingMore ? t("chat.loadingOlder") : t("chat.loadOlder") }}
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

    <ul v-else class="space-y-2" role="list">
      <li
        v-for="msg in messages"
        :key="msg.id"
        class="flex"
        :class="msg.mine ? 'justify-end' : 'justify-start'"
      >
        <div
          class="max-w-[85%] sm:max-w-[70%]"
          :class="
            isMediaBubble(msg)
              ? ''
              : msg.mine
                ? 'rounded-2xl rounded-br-md bg-brand-600 px-3 py-2 text-white'
                : 'rounded-2xl rounded-bl-md bg-slate-100 px-3 py-2 text-slate-800'
          "
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
            <p class="whitespace-pre-wrap break-words text-sm leading-relaxed">
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
      </li>
    </ul>
  </div>
</template>
