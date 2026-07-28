<script setup lang="ts">
import type { ChatMessage } from "~/types/chat";
import { ChatMessageKind, getChatSticker } from "~/types/chat";

const props = defineProps<{
  messages: ChatMessage[];
  hasMore?: boolean;
  loading?: boolean;
  loadingMore?: boolean;
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

function stickerEmoji(id: string | null) {
  if (!id) return "❓";
  return getChatSticker(id)?.emoji ?? "❓";
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
            msg.kind === ChatMessageKind.Sticker ||
            msg.kind === ChatMessageKind.Emoji
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
          <template v-else>
            <p class="whitespace-pre-wrap break-words text-sm leading-relaxed">
              {{ msg.body }}
            </p>
          </template>
          <p
            class="mt-1 text-[10px]"
            :class="
              msg.mine && msg.kind === ChatMessageKind.Text
                ? 'text-brand-100'
                : 'text-slate-400'
            "
          >
            {{ formatTime(msg.createdAt) }}
          </p>
        </div>
      </li>
    </ul>
  </div>
</template>
