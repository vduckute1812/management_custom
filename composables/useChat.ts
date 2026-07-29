import type { ChatConversation, ChatMessage, ChatSticker } from "~/types/chat";
import { ChatMessageKind } from "~/types/chat";

/** Slow REST fallback while the thread SSE stream is down. */
const FALLBACK_POLL_MS = 15_000;
const RECONNECT_MS = 5_000;
const FALLBACK_AFTER_FAILURES = 3;

/**
 * Module-scoped live connection — `useChat()` is called from the chat page
 * and from `chat-inbox.client.ts`; per-call `let`s would desync the stream
 * from the shared `useState` thread.
 */
const threadLive = {
  enabled: false,
  source: null as EventSource | null,
  conversationId: null as string | null,
  reconnectTimer: null as ReturnType<typeof setTimeout> | null,
  fallbackTimer: null as ReturnType<typeof setInterval> | null,
  failures: 0,
  /** Bumps on every connect/disconnect so stale onerror cannot clobber state. */
  generation: 0,
  onMessage: null as ((message: ChatMessage) => void) | null,
  onRead: null as ((userId: string, lastReadAt: string) => void) | null,
  onCatchUp: null as (() => void | Promise<void>) | null,
};

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

function clearReconnectTimer() {
  if (threadLive.reconnectTimer) {
    clearTimeout(threadLive.reconnectTimer);
    threadLive.reconnectTimer = null;
  }
}

function stopFallbackPoll() {
  if (threadLive.fallbackTimer) {
    clearInterval(threadLive.fallbackTimer);
    threadLive.fallbackTimer = null;
  }
}

function startFallbackPoll() {
  if (threadLive.fallbackTimer || !threadLive.enabled) return;
  threadLive.fallbackTimer = setInterval(() => {
    void threadLive.onCatchUp?.();
  }, FALLBACK_POLL_MS);
}

function disconnectThreadStream() {
  threadLive.generation += 1;
  clearReconnectTimer();
  stopFallbackPoll();
  if (threadLive.source) {
    threadLive.source.close();
    threadLive.source = null;
  }
  threadLive.conversationId = null;
}

function scheduleReconnect(conversationId: string) {
  if (!threadLive.enabled || threadLive.reconnectTimer) return;
  threadLive.reconnectTimer = setTimeout(() => {
    threadLive.reconnectTimer = null;
    if (threadLive.enabled) connectThreadStream(conversationId);
  }, RECONNECT_MS);
}

function connectThreadStream(conversationId: string) {
  if (!import.meta.client || !threadLive.enabled || !conversationId) return;

  if (
    threadLive.source &&
    threadLive.conversationId === conversationId &&
    (threadLive.source.readyState === EventSource.OPEN ||
      threadLive.source.readyState === EventSource.CONNECTING)
  ) {
    return;
  }

  const generation = ++threadLive.generation;
  clearReconnectTimer();
  if (threadLive.source) {
    threadLive.source.close();
    threadLive.source = null;
  }

  const es = new EventSource(
    `/api/chat/conversations/${conversationId}/stream`,
  );
  threadLive.source = es;
  threadLive.conversationId = conversationId;

  es.addEventListener("ready", () => {
    if (generation !== threadLive.generation) return;
    threadLive.failures = 0;
    stopFallbackPoll();
    // Catch up anything missed between REST history load / disconnect and SSE.
    void threadLive.onCatchUp?.();
  });

  es.addEventListener("message", (ev) => {
    if (generation !== threadLive.generation) return;
    try {
      const payload = JSON.parse((ev as MessageEvent).data) as {
        type: "message";
        message: ChatMessage;
      };
      if (payload?.message) threadLive.onMessage?.(payload.message);
    } catch {
      // ignore malformed frames
    }
  });

  es.addEventListener("read", (ev) => {
    if (generation !== threadLive.generation) return;
    try {
      const payload = JSON.parse((ev as MessageEvent).data) as {
        type: "read";
        userId: string;
        lastReadAt: string;
      };
      if (payload?.lastReadAt) {
        threadLive.onRead?.(payload.userId, payload.lastReadAt);
      }
    } catch {
      // ignore malformed frames
    }
  });

  es.addEventListener("ping", () => {
    // heartbeat
  });

  es.onerror = () => {
    if (generation !== threadLive.generation) return;
    es.close();
    if (threadLive.source === es) threadLive.source = null;
    threadLive.failures += 1;
    if (threadLive.failures >= FALLBACK_AFTER_FAILURES) {
      startFallbackPoll();
    }
    // Keep conversationId so reconnect can retarget the same thread.
    threadLive.conversationId = conversationId;
    scheduleReconnect(conversationId);
  };
}

export const useChat = () => {
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
    const myId = auth.user.value?.id;
    const mine =
      opts?.fromSelf === true ||
      (myId != null && message.senderId === myId);
    const normalized: ChatMessage = {
      ...message,
      mine,
      readByPeer: mine ? false : undefined,
    };
    const withRead = applyPeerRead(
      [...messages.value, normalized],
      peerLastReadAt.value,
    );
    messages.value = withRead;
    touchSidebar(withRead[withRead.length - 1] ?? normalized);

    if (
      !mine &&
      activeId.value &&
      message.conversationId === activeId.value
    ) {
      void apiFetch(`/api/chat/conversations/${activeId.value}/read`, {
        method: "POST",
      }).catch(() => undefined);
      void refreshConversations().catch(() => undefined);
    }
  }

  function applyReadEvent(userId: string, lastReadAt: string) {
    const myId = auth.user.value?.id;
    if (!myId || userId === myId) return;
    peerLastReadAt.value = lastReadAt;
    messages.value = applyPeerRead(messages.value, peerLastReadAt.value);
    const conv = conversations.value.find((c) => c.id === activeId.value);
    if (conv) conv.peerLastReadAt = lastReadAt;
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
    // Always retarget when live is on — works across page + inbox plugin calls.
    if (threadLive.enabled) connectThreadStream(id);
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
      ingestMessage(res.message, { fromSelf: true });
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
      ingestMessage(res.message, { fromSelf: true });
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
      ingestMessage(res.message, { fromSelf: true });
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
      ingestMessage(res.message, { fromSelf: true });
    } finally {
      sending.value = false;
    }
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
