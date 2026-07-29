/**
 * In-process fan-out for open chat thread SSE subscribers.
 *
 * Keyed by conversationId. Send / mark-read paths publish so the peer's
 * open `/chat` thread updates without 3.5s polling.
 */
import type { ChatMessage } from "~/types/chat";

export type ChatThreadMessageEvent = {
  type: "message";
  message: ChatMessage;
};

export type ChatThreadReadEvent = {
  type: "read";
  userId: string;
  lastReadAt: string;
};

export type ChatThreadEvent = ChatThreadMessageEvent | ChatThreadReadEvent;

type ThreadSink = (event: ChatThreadEvent) => void | Promise<void>;

const subscribers = new Map<string, Set<ThreadSink>>();

export function subscribeChatThread(
  conversationId: string,
  sink: ThreadSink,
): () => void {
  let set = subscribers.get(conversationId);
  if (!set) {
    set = new Set();
    subscribers.set(conversationId, set);
  }
  set.add(sink);
  return () => {
    set!.delete(sink);
    if (set!.size === 0) subscribers.delete(conversationId);
  };
}

export function chatThreadSubscriberCount(conversationId: string): number {
  return subscribers.get(conversationId)?.size ?? 0;
}

export function publishChatThread(
  conversationId: string,
  event: ChatThreadEvent,
): void {
  const set = subscribers.get(conversationId);
  if (!set?.size) return;
  for (const sink of set) {
    try {
      void Promise.resolve(sink(event)).catch(() => {
        // Drop failed writes; stream onClosed unsubscribes.
      });
    } catch {
      // Ignore sync throw from a single subscriber.
    }
  }
}

/** Test helper — clears all subscribers between unit tests. */
export function _resetChatThreadForTests(): void {
  subscribers.clear();
}
