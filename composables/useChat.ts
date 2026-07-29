import type { ChatConversation, ChatMessage, ChatSticker } from "~/types/chat";
import { ChatMessageKind } from "~/types/chat";

const POLL_MS = 3500;

function applyPeerRead(
  list: ChatMessage[],
  peerLastReadAt: string | null,
): ChatMessage[] {
  if (!peerLastReadAt) {
    return list.map((m) =>
      m.mine ? { ...m, readByPeer: false } : { ...m, readByPeer: undefined },
    );
  }
  const readAt = new Date(peerLastReadAt).getTime();
  return list.map((m) => {
    if (!m.mine) return { ...m, readByPeer: undefined };
    return {
      ...m,
      readByPeer: new Date(m.createdAt).getTime() <= readAt,
    };
  });
}

export const useChat = () => {
  const { apiFetch } = useApi();

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
        peerLastReadAt: string | null;
      }>(`/api/chat/conversations/${id}/messages`, {
        query: { limit: 50 },
      });
      peerLastReadAt.value = res.peerLastReadAt ?? null;
      messages.value = applyPeerRead(res.messages, peerLastReadAt.value);
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
      peerLastReadAt: string | null;
    }>(`/api/chat/conversations/${activeId.value}/messages`, {
      query: { limit: 50, before },
    });
    if (res.peerLastReadAt) {
      peerLastReadAt.value = res.peerLastReadAt;
    }
    const existing = new Set(messages.value.map((m) => m.id));
    const older = applyPeerRead(
      res.messages.filter((m) => !existing.has(m.id)),
      peerLastReadAt.value,
    );
    messages.value = applyPeerRead(
      [...older, ...messages.value],
      peerLastReadAt.value,
    );
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
      if (!fresh.length) return;

      messages.value = applyPeerRead(
        [...messages.value, ...fresh],
        peerLastReadAt.value,
      );
      await apiFetch(`/api/chat/conversations/${activeId.value}/read`, {
        method: "POST",
      });
      // Sidebar last-message preview only needs a full list refresh when
      // something new arrived. Unread totals come from the inbox SSE stream.
      await refreshConversations().catch(() => undefined);
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

  async function sendImage(uploadId: string) {
    if (!activeId.value || sending.value) return;
    sending.value = true;
    try {
      const res = await apiFetch<{ message: ChatMessage }>(
        `/api/chat/conversations/${activeId.value}/messages`,
        {
          method: "POST",
          body: { kind: ChatMessageKind.Image, uploadId },
        },
      );
      appendMessage(res.message);
    } finally {
      sending.value = false;
    }
  }

  async function sendAudio(uploadId: string, durationMs: number) {
    if (!activeId.value || sending.value) return;
    sending.value = true;
    try {
      const res = await apiFetch<{ message: ChatMessage }>(
        `/api/chat/conversations/${activeId.value}/messages`,
        {
          method: "POST",
          body: { kind: ChatMessageKind.Audio, uploadId, durationMs },
        },
      );
      appendMessage(res.message);
    } finally {
      sending.value = false;
    }
  }

  function appendMessage(message: ChatMessage) {
    if (messages.value.some((m) => m.id === message.id)) return;
    const withRead = applyPeerRead(
      [...messages.value, { ...message, mine: true, readByPeer: false }],
      peerLastReadAt.value,
    );
    messages.value = withRead;
    const conv = conversations.value.find(
      (c) => c.id === message.conversationId,
    );
    if (conv) {
      conv.lastMessage = withRead[withRead.length - 1] ?? message;
      conv.lastMessageAt = message.createdAt;
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
    sendSticker,
    sendImage,
    sendAudio,
    startPolling,
    stopPolling,
    closeConversation,
    pollNewMessages,
  };
};
