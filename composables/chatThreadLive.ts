/**
 * Module-scoped SSE connection state and helpers for the chat thread stream.
 *
 * Extracted from `useChat.ts` so the connection machinery can be read and
 * reasoned about independently from the Nuxt composable state.
 *
 * `useChat.ts` imports { threadLive, connectThreadStream, disconnectThreadStream,
 * applyPeerRead, normalizeMessage } from here and wires the callbacks.
 */
import type { ChatMessage, ChatMessageReactionType } from "~/types/chat";
import { emptyChatReactions } from "~/types/chat";

// ---------------------------------------------------------------------------
// Reconnect / fallback constants
// ---------------------------------------------------------------------------

export const FALLBACK_POLL_MS = 15_000;
export const RECONNECT_MS = 5_000;
export const FALLBACK_AFTER_FAILURES = 3;

// ---------------------------------------------------------------------------
// Module-scoped live connection singleton
// ---------------------------------------------------------------------------

/**
 * One live EventSource per app — `useChat()` is called from the chat page
 * and from `chat-inbox.client.ts`; per-call `let`s would desync the stream
 * from the shared `useState` thread.
 */
export const threadLive = {
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
  onReaction: null as
    | ((payload: {
        messageId: string;
        conversationId: string;
        userId: string;
        reaction: ChatMessageReactionType | null;
        reactions: Record<ChatMessageReactionType, number>;
        reactionCount: number;
      }) => void)
    | null,
  onDeleted: null as
    ((payload: { messageId: string; conversationId: string }) => void) | null,
  onCatchUp: null as (() => void | Promise<void>) | null,
};

// ---------------------------------------------------------------------------
// Internal timer helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Connect / disconnect / reconnect
// ---------------------------------------------------------------------------

export function disconnectThreadStream() {
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

export function connectThreadStream(conversationId: string) {
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

  es.addEventListener("reaction", (ev) => {
    if (generation !== threadLive.generation) return;
    try {
      const payload = JSON.parse((ev as MessageEvent).data) as {
        type: "reaction";
        messageId: string;
        conversationId: string;
        userId: string;
        reaction: ChatMessageReactionType | null;
        reactions: Record<ChatMessageReactionType, number>;
        reactionCount: number;
      };
      if (payload?.messageId) threadLive.onReaction?.(payload);
    } catch {
      // ignore malformed frames
    }
  });

  es.addEventListener("deleted", (ev) => {
    if (generation !== threadLive.generation) return;
    try {
      const payload = JSON.parse((ev as MessageEvent).data) as {
        type: "deleted";
        messageId: string;
        conversationId: string;
      };
      if (payload?.messageId) threadLive.onDeleted?.(payload);
    } catch {
      // ignore malformed frames
    }
  });

  es.addEventListener("ping", () => {
    // heartbeat — no-op
  });

  es.onerror = () => {
    if (generation !== threadLive.generation) return;
    es.close();
    if (threadLive.source === es) threadLive.source = null;
    threadLive.failures += 1;
    if (threadLive.failures >= FALLBACK_AFTER_FAILURES) {
      startFallbackPoll();
    }
    // Preserve conversationId so reconnect retargets the same thread.
    threadLive.conversationId = conversationId;
    scheduleReconnect(conversationId);
  };
}

// ---------------------------------------------------------------------------
// Message normalisation helpers (shared with useChat.ts)
// ---------------------------------------------------------------------------

export function applyPeerRead(
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

export function normalizeMessage(
  message: ChatMessage,
  opts?: { fromSelf?: boolean; myId?: string | null },
): ChatMessage {
  const myId = opts?.myId;
  const mine =
    opts?.fromSelf === true || (myId != null && message.senderId === myId);
  return {
    ...message,
    reactions: message.reactions ?? emptyChatReactions(),
    reactionCount: message.reactionCount ?? 0,
    myReaction: message.myReaction ?? null,
    mine,
    readByPeer: mine ? (message.readByPeer ?? false) : undefined,
  };
}
