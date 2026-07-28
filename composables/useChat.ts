import type { ChatConversation, ChatMessage, ChatSticker } from "~/types/chat";
import { ChatMessageKind } from "~/types/chat";

const POLL_MS = 3500;

export const useChat = () => {
  const { apiFetch } = useApi();

  const conversations = useState<ChatConversation[]>(
    "chat:conversations",
    () => [],
  );
  const unreadTotal = useState<number>("chat:unreadTotal", () => 0);
  const activeId = useState<string | null>("chat:activeId", () => null);
  const messages = useState<ChatMessage[]>("chat:messages", () => []);
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
  const sending = useState<boolean>("chat:sending", () => false);
  const stickers = useState<ChatSticker[]>("chat:stickers", () => []);
  const emoji = useState<string[]>("chat:emoji", () => []);
  const error = useState<string | null>("chat:error", () => null);

  let pollTimer: ReturnType<typeof setInterval> | null = null;

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
    } catch (err) {
      error.value =
        (err as { statusMessage?: string })?.statusMessage ||
        "Failed to load conversations";
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
      }>(`/api/chat/conversations/${id}/messages`, {
        query: { limit: 50 },
      });
      messages.value = res.messages;
      messagesHasMore.value = res.hasMore;
      // Clear unread for this thread locally
      const conv = conversations.value.find((c) => c.id === id);
      if (conv && conv.unreadCount > 0) {
        unreadTotal.value = Math.max(0, unreadTotal.value - conv.unreadCount);
        conv.unreadCount = 0;
      }
    } catch (err) {
      error.value =
        (err as { statusMessage?: string })?.statusMessage ||
        "Failed to load messages";
      throw err;
    } finally {
      loadingMessages.value = false;
    }
  }

  async function loadOlderMessages() {
    if (!activeId.value || !messages.value.length || !messagesHasMore.value) {
      return;
    }
    const before = messages.value[0]?.id;
    if (!before) return;
    const res = await apiFetch<{
      messages: ChatMessage[];
      hasMore: boolean;
    }>(`/api/chat/conversations/${activeId.value}/messages`, {
      query: { limit: 50, before },
    });
    const existing = new Set(messages.value.map((m) => m.id));
    const older = res.messages.filter((m) => !existing.has(m.id));
    messages.value = [...older, ...messages.value];
    messagesHasMore.value = res.hasMore;
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
      }>(`/api/chat/conversations/${activeId.value}/messages`, {
        query: { limit: 50, after: last.id },
      });
      if (res.messages.length) {
        const existing = new Set(messages.value.map((m) => m.id));
        const fresh = res.messages.filter((m) => !existing.has(m.id));
        if (fresh.length) {
          messages.value = [...messages.value, ...fresh];
          await apiFetch(`/api/chat/conversations/${activeId.value}/read`, {
            method: "POST",
          });
        }
      }
      // Soft-refresh conversation list for previews / unread elsewhere
      const list = await apiFetch<{
        conversations: ChatConversation[];
        unreadTotal: number;
      }>("/api/chat/conversations");
      conversations.value = list.conversations;
      unreadTotal.value = list.unreadTotal;
    } catch {
      // Poll failures are non-fatal
    }
  }

  function startPolling() {
    stopPolling();
    if (!import.meta.client) return;
    pollTimer = setInterval(() => {
      void pollNewMessages();
    }, POLL_MS);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function sendText(text: string) {
    if (!activeId.value) return;
    const body = text.trim();
    if (!body || sending.value) return;
    sending.value = true;
    try {
      const res = await apiFetch<{ message: ChatMessage }>(
        `/api/chat/conversations/${activeId.value}/messages`,
        {
          method: "POST",
          body: { kind: ChatMessageKind.Text, body },
        },
      );
      appendMessage(res.message);
    } finally {
      sending.value = false;
    }
  }

  async function sendEmoji(emojiChar: string) {
    if (!activeId.value || sending.value) return;
    sending.value = true;
    try {
      const res = await apiFetch<{ message: ChatMessage }>(
        `/api/chat/conversations/${activeId.value}/messages`,
        {
          method: "POST",
          body: { kind: ChatMessageKind.Emoji, body: emojiChar },
        },
      );
      appendMessage(res.message);
    } finally {
      sending.value = false;
    }
  }

  async function sendSticker(stickerId: string) {
    if (!activeId.value || sending.value) return;
    sending.value = true;
    try {
      const res = await apiFetch<{ message: ChatMessage }>(
        `/api/chat/conversations/${activeId.value}/messages`,
        {
          method: "POST",
          body: { kind: ChatMessageKind.Sticker, stickerId },
        },
      );
      appendMessage(res.message);
    } finally {
      sending.value = false;
    }
  }

  function appendMessage(message: ChatMessage) {
    if (messages.value.some((m) => m.id === message.id)) return;
    messages.value = [...messages.value, message];
    const conv = conversations.value.find(
      (c) => c.id === message.conversationId,
    );
    if (conv) {
      conv.lastMessage = message;
      conv.lastMessageAt = message.createdAt;
      // Move to top
      conversations.value = [
        conv,
        ...conversations.value.filter((c) => c.id !== conv.id),
      ];
    }
  }

  function closeConversation() {
    activeId.value = null;
    messages.value = [];
    messagesHasMore.value = false;
  }

  return {
    conversations,
    unreadTotal,
    activeId,
    activeConversation,
    messages,
    messagesHasMore,
    loadingConversations,
    loadingMessages,
    sending,
    stickers,
    emoji,
    error,
    refreshConversations,
    ensureCatalog,
    startConversation,
    openConversation,
    loadOlderMessages,
    sendText,
    sendEmoji,
    sendSticker,
    startPolling,
    stopPolling,
    closeConversation,
    pollNewMessages,
  };
};
