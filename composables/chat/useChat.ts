import type { ChatConversation, ChatMessage, ChatSticker } from "~/types/chat";
import { createChatMessageActions } from "~/composables/chat/chatMessageActions";
import {
  threadLive,
  connectThreadStream,
  disconnectThreadStream,
  applyPeerRead,
  normalizeMessage,
} from "~/composables/chat/chatThreadLive";
import { createChatConversationsApi } from "~/composables/chat/chatConversationsApi";
import { createChatThreadState } from "~/composables/chat/chatThreadState";

export const useChat = () => {
  const { t } = useSafeI18n();
  const { apiFetch } = useApi();
  const auth = useAuth();

  const conversations = useState<ChatConversation[]>(
    "chat:conversations",
    () => [],
  );
  const unreadTotal = useState<number>("chat:unreadTotal", () => 0);
  const conversationsNextCursor = useState<string | null>(
    "chat:conversationsNextCursor",
    () => null,
  );
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
  const loadingMoreConversations = useState<boolean>(
    "chat:loadingMoreConversations",
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

  async function openConversation(id: string) {
    activeId.value = id;
    loadingMessages.value = true;
    // Drop the previous thread immediately so the scroller can pin to the
    // newest page of this conversation instead of flashing older history.
    messages.value = [];
    messagesHasMore.value = false;
    peerLastReadAt.value = null;
    error.value = null;
    try {
      const res = await apiFetch<{
        messages: ChatMessage[];
        hasMore: boolean;
        peerLastReadAt: string | null;
      }>(`/api/chat/conversations/${id}/messages`, {
        query: { limit: 40 },
      });
      // Stale response if the user switched conversations mid-flight.
      if (activeId.value !== id) return;
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
      if (activeId.value !== id) return;
      error.value =
        (err as { statusMessage?: string })?.statusMessage ||
        t("chat.failedToLoadMessages");
      throw err;
    } finally {
      if (activeId.value === id) {
        loadingMessages.value = false;
      }
    }
    if (activeId.value !== id) return;
    // Always retarget when live is on — works across page + inbox plugin calls.
    if (threadLive.enabled) connectThreadStream(id);
  }

  const conversationsApi = createChatConversationsApi({
    conversations,
    unreadTotal,
    conversationsNextCursor,
    activeId,
    peerLastReadAt,
    messages,
    loadingConversations,
    loadingMoreConversations,
    stickers,
    emoji,
    error,
    apiFetch,
    t,
    openConversation,
  });

  const threadState = createChatThreadState({
    conversations,
    messages,
    activeId,
    peerLastReadAt,
    myId: () => auth.user.value?.id,
    apiFetch,
    refreshConversations: conversationsApi.refreshConversations,
    openConversation,
  });

  const messageActions = createChatMessageActions({
    activeId,
    messages,
    conversations,
    sending,
    apiFetch,
    ingestMessage: threadState.ingestMessage,
  });

  // Keep singleton handlers pointed at this call's closures (shared useState).
  threadLive.onMessage = (message) => threadState.ingestMessage(message);
  threadLive.onRead = (userId, lastReadAt) =>
    threadState.applyReadEvent(userId, lastReadAt);
  threadLive.onReaction = (payload) => threadState.applyReactionEvent(payload);
  threadLive.onDeleted = (payload) => threadState.applyDeletedEvent(payload);
  threadLive.onCatchUp = () => threadState.pollNewMessages();

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
    conversationsNextCursor,
    activeId,
    activeConversation,
    messages,
    peerLastReadAt,
    messagesHasMore,
    loadingConversations,
    loadingMoreConversations,
    loadingMessages,
    loadingOlderMessages,
    sending,
    stickers,
    emoji,
    error,
    refreshConversations: conversationsApi.refreshConversations,
    loadMoreConversations: conversationsApi.loadMoreConversations,
    ensureCatalog: conversationsApi.ensureCatalog,
    startConversation: conversationsApi.startConversation,
    openConversation,
    loadOlderMessages,
    ...messageActions,
    startPolling,
    stopPolling,
    closeConversation,
    pollNewMessages: threadState.pollNewMessages,
  };
};
