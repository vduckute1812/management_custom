import type {
  ChatConversation,
  ChatMessage,
  ChatMessageReactionType,
  ChatSticker,
} from "~/types/chat";
import { createChatMessageActions } from "~/composables/chatMessageActions";
import {
  threadLive,
  connectThreadStream,
  disconnectThreadStream,
  applyPeerRead,
  normalizeMessage,
} from "~/composables/chatThreadLive";

export const useChat = () => {
  const { t } = useSafeI18n();
  const { apiFetch } = useApi();
  const auth = useAuth();

  const conversations = useState<ChatConversation[]>(
    "chat:conversations",
    () => [],
  );
  const unreadTotal = useState<number>("chat:unreadTotal", () => 0);
  const activeId = useState<string | null>("chat:activeId", () => null);
  const messages = useState<ChatMessage[]>("chat:messages", () => []);
  const peerLastReadAt = useState<string | null>(
    "chat:peerLastReadAt",
    () => null,
  );
  const messagesHasMore = useState<boolean>(
    "chat:messagesHasMore",
    () => false,
  );
  const loadingConversations = useState<boolean>(
    "chat:loadingConversations",
    () => false,
  );
  const loadingMessages = useState<boolean>(
    "chat:loadingMessages",
    () => false,
  );
  const loadingOlderMessages = useState<boolean>(
    "chat:loadingOlderMessages",
    () => false,
  );
  const sending = useState<boolean>("chat:sending", () => false);
  const stickers = useState<ChatSticker[]>("chat:stickers", () => []);
  const emoji = useState<string[]>("chat:emoji", () => []);
  const error = useState<string | null>("chat:error", () => null);

  const activeConversation = computed(
    () => conversations.value.find((c) => c.id === activeId.value) ?? null,
  );

  async function refreshConversations() {
    loadingConversations.value = true;
    error.value = null;
    try {
      const res = await apiFetch<{
        conversations: ChatConversation[];
        unreadTotal: number;
      }>("/api/chat/conversations");
      conversations.value = res.conversations;
      unreadTotal.value = res.unreadTotal;
      if (activeId.value) {
        const active = res.conversations.find((c) => c.id === activeId.value);
        if (active?.peerLastReadAt !== undefined) {
          peerLastReadAt.value = active.peerLastReadAt;
          messages.value = applyPeerRead(messages.value, peerLastReadAt.value);
        }
      }
    } catch (err) {
      error.value =
        (err as { statusMessage?: string })?.statusMessage ||
        t("chat.failedToLoadConversations");
      throw err;
    } finally {
      loadingConversations.value = false;
    }
  }

  async function ensureCatalog() {
    if (stickers.value.length && emoji.value.length) return;
    const res = await apiFetch<{ stickers: ChatSticker[]; emoji: string[] }>(
      "/api/chat/catalog",
    );
    stickers.value = res.stickers;
    emoji.value = res.emoji;
  }

  function touchSidebar(message: ChatMessage) {
    const conv = conversations.value.find(
      (c) => c.id === message.conversationId,
    );
    if (!conv) return;
    conv.lastMessage = message;
    conv.lastMessageAt = message.createdAt;
    conversations.value = [
      conv,
      ...conversations.value.filter((c) => c.id !== conv.id),
    ];
  }

  function ingestMessage(message: ChatMessage, opts?: { fromSelf?: boolean }) {
    if (messages.value.some((m) => m.id === message.id)) return;
    const normalized = normalizeMessage(message, {
      fromSelf: opts?.fromSelf,
      myId: auth.user.value?.id,
    });
    const withRead = applyPeerRead(
      [...messages.value, normalized],
      peerLastReadAt.value,
    );
    messages.value = withRead;
    touchSidebar(withRead[withRead.length - 1] ?? normalized);

    if (
      !normalized.mine &&
      activeId.value &&
      message.conversationId === activeId.value
    ) {
      void apiFetch(`/api/chat/conversations/${activeId.value}/read`, {
        method: "POST",
      }).catch(() => undefined);
      void refreshConversations().catch(() => undefined);
    }
  }

  const messageActions = createChatMessageActions({
    activeId,
    messages,
    conversations,
    sending,
    apiFetch,
    ingestMessage,
  });

  function applyReadEvent(userId: string, lastReadAt: string) {
    const myId = auth.user.value?.id;
    if (!myId || userId === myId) return;
    peerLastReadAt.value = lastReadAt;
    messages.value = applyPeerRead(messages.value, peerLastReadAt.value);
    const conv = conversations.value.find((c) => c.id === activeId.value);
    if (conv) conv.peerLastReadAt = lastReadAt;
  }

  function applyReactionEvent(payload: {
    messageId: string;
    conversationId: string;
    userId: string;
    reaction: ChatMessageReactionType | null;
    reactions: Record<ChatMessageReactionType, number>;
    reactionCount: number;
  }) {
    if (activeId.value && payload.conversationId !== activeId.value) {
      return;
    }
    const myId = auth.user.value?.id;
    messages.value = messages.value.map((m) => {
      if (m.id !== payload.messageId) return m;
      return {
        ...m,
        reactions: payload.reactions,
        reactionCount: payload.reactionCount,
        myReaction:
          myId && payload.userId === myId ? payload.reaction : m.myReaction,
      };
    });
  }

  function applyDeletedEvent(payload: {
    messageId: string;
    conversationId: string;
  }) {
    if (activeId.value && payload.conversationId !== activeId.value) {
      return;
    }
    messages.value = messages.value.filter((m) => m.id !== payload.messageId);

    const conv = conversations.value.find(
      (c) => c.id === payload.conversationId,
    );
    if (conv?.lastMessage?.id === payload.messageId) {
      const remaining = messages.value;
      conv.lastMessage =
        remaining.length > 0 ? (remaining[remaining.length - 1] ?? null) : null;
    }
  }

  async function pollNewMessages() {
    if (!activeId.value) return;
    const last = messages.value[messages.value.length - 1];
    if (!last) {
      await openConversation(activeId.value);
      return;
    }
    try {
      const res = await apiFetch<{
        messages: ChatMessage[];
        hasMore: boolean;
        peerLastReadAt: string | null;
      }>(`/api/chat/conversations/${activeId.value}/messages`, {
        query: { limit: 50, after: last.id },
      });
      if (res.peerLastReadAt !== undefined) {
        peerLastReadAt.value = res.peerLastReadAt;
      }
      messages.value = applyPeerRead(messages.value, peerLastReadAt.value);

      if (!res.messages.length) return;

      const existing = new Set(messages.value.map((m) => m.id));
      const fresh = res.messages.filter((m) => !existing.has(m.id));
      for (const msg of fresh) {
        ingestMessage(msg);
      }
    } catch {
      // Fallback / catch-up failures are non-fatal
    }
  }

  // Keep singleton handlers pointed at this call's closures (shared useState).
  threadLive.onMessage = (message) => ingestMessage(message);
  threadLive.onRead = (userId, lastReadAt) =>
    applyReadEvent(userId, lastReadAt);
  threadLive.onReaction = (payload) => applyReactionEvent(payload);
  threadLive.onDeleted = (payload) => applyDeletedEvent(payload);
  threadLive.onCatchUp = () => pollNewMessages();

  async function startConversation(peerUserId: string) {
    const res = await apiFetch<{ conversation: ChatConversation }>(
      "/api/chat/conversations",
      { method: "POST", body: { peerUserId } },
    );
    const existing = conversations.value.find(
      (c) => c.id === res.conversation.id,
    );
    if (!existing) {
      conversations.value = [res.conversation, ...conversations.value];
    } else {
      Object.assign(existing, res.conversation);
    }
    await openConversation(res.conversation.id);
    return res.conversation;
  }

  async function openConversation(id: string) {
    activeId.value = id;
    loadingMessages.value = true;
    error.value = null;
    try {
      const res = await apiFetch<{
        messages: ChatMessage[];
        hasMore: boolean;
        peerLastReadAt: string | null;
      }>(`/api/chat/conversations/${id}/messages`, {
        query: { limit: 40 },
      });
      peerLastReadAt.value = res.peerLastReadAt ?? null;
      messages.value = applyPeerRead(
        res.messages.map((m) =>
          normalizeMessage(m, { myId: auth.user.value?.id }),
        ),
        peerLastReadAt.value,
      );
      messagesHasMore.value = res.hasMore;
      const conv = conversations.value.find((c) => c.id === id);
      if (conv) {
        conv.peerLastReadAt = peerLastReadAt.value;
        if (conv.unreadCount > 0) {
          unreadTotal.value = Math.max(0, unreadTotal.value - conv.unreadCount);
          conv.unreadCount = 0;
        }
      }
    } catch (err) {
      error.value =
        (err as { statusMessage?: string })?.statusMessage ||
        t("chat.failedToLoadMessages");
      throw err;
    } finally {
      loadingMessages.value = false;
    }
    // Always retarget when live is on — works across page + inbox plugin calls.
    if (threadLive.enabled) connectThreadStream(id);
  }

  async function loadOlderMessages() {
    if (
      !activeId.value ||
      !messages.value.length ||
      !messagesHasMore.value ||
      loadingOlderMessages.value
    ) {
      return;
    }
    const before = messages.value[0]?.id;
    if (!before) return;
    loadingOlderMessages.value = true;
    try {
      const res = await apiFetch<{
        messages: ChatMessage[];
        hasMore: boolean;
        peerLastReadAt: string | null;
      }>(`/api/chat/conversations/${activeId.value}/messages`, {
        query: { limit: 40, before },
      });
      if (res.peerLastReadAt) {
        peerLastReadAt.value = res.peerLastReadAt;
      }
      const existing = new Set(messages.value.map((m) => m.id));
      const older = applyPeerRead(
        res.messages
          .filter((m) => !existing.has(m.id))
          .map((m) => normalizeMessage(m, { myId: auth.user.value?.id })),
        peerLastReadAt.value,
      );
      messages.value = applyPeerRead(
        [...older, ...messages.value],
        peerLastReadAt.value,
      );
      messagesHasMore.value = res.hasMore;
    } finally {
      loadingOlderMessages.value = false;
    }
  }

  /** Enable live thread updates (SSE, with slow REST fallback). */
  function startPolling() {
    threadLive.enabled = true;
    if (activeId.value) connectThreadStream(activeId.value);
  }

  function stopPolling() {
    threadLive.enabled = false;
    threadLive.failures = 0;
    disconnectThreadStream();
  }

  function closeConversation() {
    disconnectThreadStream();
    activeId.value = null;
    messages.value = [];
    messagesHasMore.value = false;
    peerLastReadAt.value = null;
  }

  return {
    conversations,
    unreadTotal,
    activeId,
    activeConversation,
    messages,
    peerLastReadAt,
    messagesHasMore,
    loadingConversations,
    loadingMessages,
    loadingOlderMessages,
    sending,
    stickers,
    emoji,
    error,
    refreshConversations,
    ensureCatalog,
    startConversation,
    openConversation,
    loadOlderMessages,
    ...messageActions,
    startPolling,
    stopPolling,
    closeConversation,
    pollNewMessages,
  };
};
