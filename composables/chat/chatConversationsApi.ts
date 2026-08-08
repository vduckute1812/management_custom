import type { ChatConversation, ChatMessage, ChatSticker } from "~/types/chat";
import type { Ref } from "vue";
import { applyPeerRead } from "~/composables/chat/chatThreadLive";

type ApiFetch = <T>(url: string, opts?: Record<string, unknown>) => Promise<T>;

export function createChatConversationsApi(deps: {
  conversations: Ref<ChatConversation[]>;
  unreadTotal: Ref<number>;
  conversationsNextCursor: Ref<string | null>;
  activeId: Ref<string | null>;
  peerLastReadAt: Ref<string | null>;
  messages: Ref<ChatMessage[]>;
  loadingConversations: Ref<boolean>;
  loadingMoreConversations: Ref<boolean>;
  stickers: Ref<ChatSticker[]>;
  emoji: Ref<string[]>;
  error: Ref<string | null>;
  apiFetch: ApiFetch;
  t: (key: string) => string;
  openConversation: (id: string) => Promise<void>;
}) {
  async function refreshConversations() {
    deps.loadingConversations.value = true;
    deps.error.value = null;
    try {
      const res = await deps.apiFetch<{
        conversations: ChatConversation[];
        unreadTotal: number;
        nextCursor: string | null;
      }>("/api/chat/conversations", { query: { limit: 50 } });
      const currentActive = deps.activeId.value
        ? deps.conversations.value.find((c) => c.id === deps.activeId.value)
        : null;
      deps.conversations.value =
        currentActive &&
        !res.conversations.some((c) => c.id === currentActive.id)
          ? [...res.conversations, currentActive]
          : res.conversations;
      deps.unreadTotal.value = res.unreadTotal;
      deps.conversationsNextCursor.value = res.nextCursor;
      if (deps.activeId.value) {
        const active = res.conversations.find(
          (c) => c.id === deps.activeId.value,
        );
        if (active?.peerLastReadAt !== undefined) {
          deps.peerLastReadAt.value = active.peerLastReadAt;
          deps.messages.value = applyPeerRead(
            deps.messages.value,
            deps.peerLastReadAt.value,
          );
        }
      }
    } catch (err) {
      deps.error.value =
        (err as { statusMessage?: string })?.statusMessage ||
        deps.t("chat.failedToLoadConversations");
      throw err;
    } finally {
      deps.loadingConversations.value = false;
    }
  }

  async function loadMoreConversations() {
    if (
      !deps.conversationsNextCursor.value ||
      deps.loadingMoreConversations.value ||
      deps.loadingConversations.value
    ) {
      return;
    }
    deps.loadingMoreConversations.value = true;
    try {
      const res = await deps.apiFetch<{
        conversations: ChatConversation[];
        unreadTotal: number;
        nextCursor: string | null;
      }>("/api/chat/conversations", {
        query: { limit: 50, cursor: deps.conversationsNextCursor.value },
      });
      const seen = new Set(deps.conversations.value.map((c) => c.id));
      deps.conversations.value = [
        ...deps.conversations.value,
        ...res.conversations.filter((c) => !seen.has(c.id)),
      ];
      deps.unreadTotal.value = res.unreadTotal;
      deps.conversationsNextCursor.value = res.nextCursor;
    } finally {
      deps.loadingMoreConversations.value = false;
    }
  }

  async function ensureCatalog() {
    if (deps.stickers.value.length && deps.emoji.value.length) return;
    const res = await deps.apiFetch<{
      stickers: ChatSticker[];
      emoji: string[];
    }>("/api/chat/catalog");
    deps.stickers.value = res.stickers;
    deps.emoji.value = res.emoji;
  }

  async function startConversation(peerUserId: string) {
    const res = await deps.apiFetch<{ conversation: ChatConversation }>(
      "/api/chat/conversations",
      { method: "POST", body: { peerUserId } },
    );
    const existing = deps.conversations.value.find(
      (c) => c.id === res.conversation.id,
    );
    if (!existing) {
      deps.conversations.value = [
        res.conversation,
        ...deps.conversations.value,
      ];
    } else {
      Object.assign(existing, res.conversation);
    }
    await deps.openConversation(res.conversation.id);
    return res.conversation;
  }

  return {
    refreshConversations,
    loadMoreConversations,
    ensureCatalog,
    startConversation,
  };
}
