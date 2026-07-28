<script setup lang="ts">
import type { ChatConversation } from "~/types/chat";
import { ChatMessageKind, getChatSticker } from "~/types/chat";

defineProps<{
  conversations: ChatConversation[];
  activeId: string | null;
  loading?: boolean;
}>();

const emit = defineEmits<{
  select: [id: string];
}>();

const { t } = useI18n();

function peerLabel(c: ChatConversation) {
  return c.peer.name?.trim() || c.peer.email;
}

function preview(c: ChatConversation): string {
  const msg = c.lastMessage;
  if (!msg) return t("chat.noMessagesYet");
  if (msg.kind === ChatMessageKind.Sticker) {
    const sticker = msg.stickerId ? getChatSticker(msg.stickerId) : undefined;
    return sticker ? sticker.emoji : t("chat.stickerPreview");
  }
  if (msg.kind === ChatMessageKind.Emoji) {
    return msg.body || "";
  }
  const text = (msg.body || "").trim();
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div
      v-if="loading && !conversations.length"
      class="space-y-2 p-3"
      aria-busy="true"
    >
      <SkeletonBlock height="h-14" rounded="rounded-lg" />
      <SkeletonBlock height="h-14" rounded="rounded-lg" />
      <SkeletonBlock height="h-14" rounded="rounded-lg" />
    </div>
    <p
      v-else-if="!conversations.length"
      class="px-4 py-8 text-center text-sm text-slate-500"
    >
      {{ t("chat.emptyConversations") }}
    </p>
    <ul v-else class="min-h-0 flex-1 overflow-y-auto" role="list">
      <li v-for="c in conversations" :key="c.id">
        <button
          type="button"
          class="flex w-full items-center gap-3 px-3 py-2.5 text-left transition"
          :class="activeId === c.id ? 'bg-brand-50' : 'hover:bg-slate-50'"
          :aria-current="activeId === c.id ? 'true' : undefined"
          @click="emit('select', c.id)"
        >
          <UserAvatar
            :name="c.peer.name"
            :email="c.peer.email"
            :avatar-url="c.peer.avatarUrl"
            size="md"
          />
          <span class="min-w-0 flex-1">
            <span class="flex items-center justify-between gap-2">
              <span class="truncate text-sm font-semibold text-slate-900">
                {{ peerLabel(c) }}
              </span>
              <span
                v-if="c.unreadCount > 0"
                class="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white"
              >
                {{ c.unreadCount > 99 ? "99+" : c.unreadCount }}
              </span>
            </span>
            <span class="mt-0.5 block truncate text-xs text-slate-500">
              {{ preview(c) }}
            </span>
          </span>
        </button>
      </li>
    </ul>
  </div>
</template>
