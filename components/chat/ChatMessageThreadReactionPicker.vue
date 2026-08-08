<script setup lang="ts">
import type { ChatMessage, ChatMessageReactionType } from "~/types/chat";
import {
  ChatMessageReaction,
  CHAT_REACTION_EMOJI,
  CHAT_REACTION_TYPES,
} from "~/types/chat";

const props = defineProps<{
  messageId: string | null;
  messages: ChatMessage[];
  anchorRect: {
    top: number;
    left: number;
    right: number;
    bottom: number;
  } | null;
  mine: boolean;
}>();

const emit = defineEmits<{
  react: [messageId: string, reaction: ChatMessageReactionType];
  clearReact: [messageId: string];
  deleteRequest: [messageId: string];
  close: [];
}>();

const { t } = useI18n();

const pickerStyle = ref<Record<string, string>>({});

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

const pickerMessage = computed(() =>
  props.messageId
    ? (props.messages.find((m) => m.id === props.messageId) ?? null)
    : null,
);

function positionPicker(
  rect: { top: number; left: number; right: number; bottom: number },
  mine: boolean,
) {
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

watch(
  () => [props.messageId, props.anchorRect, props.mine] as const,
  ([id, rect]) => {
    if (id && rect) positionPicker(rect, props.mine);
    else pickerStyle.value = {};
  },
  { immediate: true },
);

function pickReaction(messageId: string, reaction: ChatMessageReactionType) {
  const msg = props.messages.find((m) => m.id === messageId);
  if (msg?.myReaction === reaction) {
    emit("clearReact", messageId);
  } else {
    emit("react", messageId, reaction);
  }
  emit("close");
}

function requestDelete(messageId: string) {
  emit("deleteRequest", messageId);
  emit("close");
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="messageId && pickerMessage"
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
</template>
