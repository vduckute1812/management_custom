/**
 * Server-Sent Events stream for the signed-in chat inbox.
 *
 * Replaces the previous client poll of `GET /api/chat/unread`. On connect the
 * client receives an immediate `inbox` snapshot; later sends/reads push the
 * same payload through `refreshAndPushInbox`. Heartbeats keep proxies from
 * closing an idle connection.
 *
 * Prod nginx must proxy these paths with HTTP/1.1, `proxy_buffering off`, and
 * a long `proxy_read_timeout` (see `docker/nginx.prod.conf.template`) — the generic
 * `/api/` location otherwise 504s long-lived EventSource connections.
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

  // Tell nginx (and similar) not to buffer SSE frames / heartbeats.
  setHeader(event, "X-Accel-Buffering", "no");
  setHeader(event, "Cache-Control", "no-cache, no-transform");

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

  // Open the stream immediately so proxies see headers/first bytes even when
  // the unread snapshot query is slow (avoids gateway 504 before any SSE).
  void (async () => {
    try {
      const initial = await getUnreadInbox(user.sub);
      await pushInbox(initial);
      await stream.push({ event: "ready", data: "{}", retry: 5000 });
    } catch (err) {
      console.warn(
        "[chat-inbox/stream] initial snapshot failed:",
        (err as Error)?.message || err,
      );
    }
  })();

  return stream.send();
});
