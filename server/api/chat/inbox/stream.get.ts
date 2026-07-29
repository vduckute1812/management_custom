/**
 * Server-Sent Events stream for the signed-in chat inbox.
 *
 * Replaces the previous client poll of `GET /api/chat/unread`. On connect the
 * client receives an immediate `inbox` snapshot; later sends/reads push the
 * same payload through `refreshAndPushInbox`. Heartbeats keep proxies from
 * closing an idle connection.
 */
import { createEventStream } from "h3";
import { getUnreadInbox } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";
import {
  subscribeChatInbox,
  type ChatInboxPayload,
} from "~/server/utils/chatInbox";

const HEARTBEAT_MS = 25_000;

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const stream = createEventStream(event);

  const pushInbox = async (payload: ChatInboxPayload) => {
    await stream.push({
      event: "inbox",
      data: JSON.stringify(payload),
    });
  };

  const unsubscribe = subscribeChatInbox(user.sub, pushInbox);

  const heartbeat = setInterval(() => {
    void stream.push({ event: "ping", data: "{}" }).catch(() => {
      // onClosed cleans up.
    });
  }, HEARTBEAT_MS);

  stream.onClosed(() => {
    clearInterval(heartbeat);
    unsubscribe();
  });

  try {
    const initial = await getUnreadInbox(user.sub);
    await pushInbox(initial);
  } catch (err) {
    clearInterval(heartbeat);
    unsubscribe();
    throw err;
  }

  // Hint EventSource to wait ~5s before auto-retry after a drop.
  await stream.push({ event: "ready", data: "{}", retry: 5000 });

  return stream.send();
});
