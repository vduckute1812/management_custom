/**
 * SSE stream for one open chat conversation.
 *
 * Emits `message` when either participant sends, and `read` when either
 * marks the thread read (for peer read receipts). Auth via HttpOnly
 * `mgmt_at` cookie (EventSource cannot set Authorization).
 */
import { createEventStream } from "h3";
import { getPeerUserId } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";
import {
  subscribeChatThread,
  type ChatThreadEvent,
} from "~/server/utils/chatThread";

const HEARTBEAT_MS = 25_000;

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: "Conversation id required",
    });
  }

  const peerId = await getPeerUserId(id, user.sub);
  if (!peerId) {
    throw createError({
      statusCode: 404,
      statusMessage: "Conversation not found",
    });
  }

  const stream = createEventStream(event);

  const pushEvent = async (payload: ChatThreadEvent) => {
    await stream.push({
      event: payload.type,
      data: JSON.stringify(payload),
    });
  };

  const unsubscribe = subscribeChatThread(id, pushEvent);

  const heartbeat = setInterval(() => {
    void stream.push({ event: "ping", data: "{}" }).catch(() => {
      // onClosed cleans up.
    });
  }, HEARTBEAT_MS);

  stream.onClosed(() => {
    clearInterval(heartbeat);
    unsubscribe();
  });

  await stream.push({ event: "ready", data: "{}", retry: 5000 });

  return stream.send();
});
