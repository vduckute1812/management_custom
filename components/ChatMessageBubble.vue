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
  message: ChatMessage;
  highlighted: boolean;
  showReadReceipt: boolean;
}>();

const emit = defineEmits<{
  (e: "bubble-pointerdown", messageId: string, event: PointerEvent): void;
  (e: "bubble-pointermove", event: PointerEvent): void;
  (e: "bubble-pointerup"): void;
  (e: "bubble-pointerleave"): void;
  (e: "bubble-pointercancel"): void;
  (
    e: "reaction-click",
    messageId: string,
    reaction: ChatMessageReactionType,
  ): void;
}>();

const { t, locale } = useI18n();

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
      count: msg.reactions[k] ?? 0,
      emoji: CHAT_REACTION_EMOJI[k],
    }),
  );
}
</script>

<template>
  <li class="flex" :class="message.mine ? 'justify-end' : 'justify-start'">
    <div class="relative max-w-[85%] sm:max-w-[70%]">
      <div
        data-chat-bubble
        class="relative touch-manipulation select-none transition-[filter,box-shadow,background-color,transform] duration-150 [-webkit-touch-callout:none] motion-reduce:transition-none"
        :class="[
          isMediaBubble(message)
            ? 'rounded-2xl px-0.5 py-0.5'
            : message.mine
              ? 'rounded-2xl rounded-br-md bg-brand-600 px-3 py-2 text-white'
              : 'rounded-2xl rounded-bl-md bg-slate-100 px-3 py-2 text-slate-800',
          highlighted
            ? isMediaBubble(message)
              ? 'scale-[0.98] bg-brand-100/80 ring-2 ring-brand-400 ring-offset-2 ring-offset-white'
              : message.mine
                ? 'scale-[0.98] bg-brand-700 shadow-md ring-2 ring-brand-300 ring-offset-2 ring-offset-white'
                : 'scale-[0.98] bg-brand-100 text-slate-900 shadow-md ring-2 ring-brand-400 ring-offset-2 ring-offset-white'
            : '',
        ]"
        @pointerdown="emit('bubble-pointerdown', message.id, $event)"
        @pointermove="emit('bubble-pointermove', $event)"
        @pointerup="emit('bubble-pointerup')"
        @pointerleave="emit('bubble-pointerleave')"
        @pointercancel="emit('bubble-pointercancel')"
        @contextmenu.prevent
      >
        <template v-if="message.kind === ChatMessageKind.Sticker">
          <span
            class="inline-block select-none text-5xl leading-none drop-shadow-sm"
            role="img"
            :aria-label="t('chat.stickerPreview')"
          >
            {{ stickerEmoji(message.stickerId) }}
          </span>
        </template>
        <template v-else-if="message.kind === ChatMessageKind.Emoji">
          <span class="inline-block select-none text-4xl leading-none">
            {{ message.body }}
          </span>
        </template>
        <template v-else-if="message.kind === ChatMessageKind.Image">
          <a
            v-if="message.attachment?.url"
            :href="message.attachment.url"
            target="_blank"
            rel="noopener noreferrer"
            class="block overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
          >
            <img
              :src="message.attachment.url"
              :alt="message.attachment.fileName || t('chat.imagePreview')"
              class="max-h-72 w-full object-contain"
              loading="lazy"
            />
          </a>
          <p v-else class="text-sm text-slate-500">
            {{ t("chat.imageUnavailable") }}
          </p>
        </template>
        <template v-else-if="message.kind === ChatMessageKind.Audio">
          <div
            class="min-w-[12rem] rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2"
            :class="message.mine ? 'border-brand-200 bg-brand-50' : ''"
          >
            <p class="mb-1 text-[11px] font-medium text-slate-500">
              {{ t("chat.voiceNote") }}
              <span v-if="message.durationMs" class="tabular-nums">
                · {{ formatDuration(message.durationMs) }}
              </span>
            </p>
            <audio
              v-if="message.attachment?.url"
              controls
              preload="metadata"
              class="w-full max-w-xs"
              :src="message.attachment.url"
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
            {{ message.body }}
          </p>
        </template>
        <div
          class="mt-1 flex items-center gap-1.5 text-[10px]"
          :class="
            message.mine && message.kind === ChatMessageKind.Text
              ? 'justify-end text-brand-100'
              : message.mine
                ? 'justify-end text-slate-400'
                : 'text-slate-400'
          "
        >
          <span>{{ formatTime(message.createdAt) }}</span>
          <span
            v-if="message.mine && showReadReceipt"
            class="font-medium"
            :class="
              message.kind === ChatMessageKind.Text
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
        v-if="topReactions(message).length"
        data-chat-react
        class="mt-1 flex flex-wrap items-center gap-1"
        :class="message.mine ? 'justify-end' : 'justify-start'"
      >
        <button
          v-for="r in topReactions(message)"
          :key="r.type"
          type="button"
          class="inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[11px] leading-none transition"
          :class="
            message.myReaction === r.type
              ? 'border-brand-300 bg-brand-50 text-brand-800'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
          "
          :title="REACTION_LABEL[r.type]"
          :aria-label="REACTION_LABEL[r.type]"
          :aria-pressed="message.myReaction === r.type"
          @click="emit('reaction-click', message.id, r.type)"
        >
          <span aria-hidden="true">{{ r.emoji }}</span>
          <span v-if="r.count > 1" class="tabular-nums">{{ r.count }}</span>
        </button>
      </div>
    </div>
  </li>
</template>
