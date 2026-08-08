/**
 * In-process chat inbox fan-out for Server-Sent Event subscribers.
 *
 * One Nitro process keeps a Map of userId → live SSE writers. Message send /
 * mark-read paths call `refreshAndPushInbox` so signed-in tabs get badge +
 * toast updates without polling `GET /api/chat/unread`.
 *
 * Multi-process deploys only see subscribers on the same process (same limit
 * as the in-memory rate-limit store). Redis pub/sub can be added later.
 */
import type { ChatUnreadPreview } from "~/server/db/chat/chat";
import { getUnreadInbox } from "~/server/db/chat/chat";

export type ChatInboxPayload = {
  unreadTotal: number;
  latest: ChatUnreadPreview | null;
};

type InboxSink = (payload: ChatInboxPayload) => void | Promise<void>;

const subscribers = new Map<string, Set<InboxSink>>();

export function subscribeChatInbox(
  userId: string,
  sink: InboxSink,
): () => void {
  let set = subscribers.get(userId);
  if (!set) {
    set = new Set();
    subscribers.set(userId, set);
  }
  set.add(sink);
  return () => {
    set!.delete(sink);
    if (set!.size === 0) subscribers.delete(userId);
  };
}

export function chatInboxSubscriberCount(userId: string): number {
  return subscribers.get(userId)?.size ?? 0;
}

export function publishChatInbox(
  userId: string,
  payload: ChatInboxPayload,
): void {
  const set = subscribers.get(userId);
  if (!set?.size) return;
  for (const sink of set) {
    try {
      void Promise.resolve(sink(payload)).catch(() => {
        // Drop failed writes; the stream onClosed path unsubscribes.
      });
    } catch {
      // Ignore sync throw from a single subscriber.
    }
  }
}

/**
 * Recompute unread for `userId` and push to live SSE subscribers.
 * No-ops when nobody is listening so send/read paths stay cheap.
 */
export async function refreshAndPushInbox(userId: string): Promise<void> {
  if (chatInboxSubscriberCount(userId) <= 0) return;
  try {
    const payload = await getUnreadInbox(userId);
    publishChatInbox(userId, payload);
  } catch (err) {
    console.warn("[chat-inbox] push failed:", (err as Error)?.message || err);
  }
}

/** Test helper — clears all subscribers between unit tests. */
export function _resetChatInboxForTests(): void {
  subscribers.clear();
}
