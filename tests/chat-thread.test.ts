import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetChatThreadForTests,
  chatThreadSubscriberCount,
  publishChatThread,
  subscribeChatThread,
} from "../server/utils/chatThread";

describe("chatThread fan-out", () => {
  beforeEach(() => {
    _resetChatThreadForTests();
  });

  it("delivers events only to the subscribed conversation", () => {
    const a = vi.fn();
    const b = vi.fn();
    subscribeChatThread("conv-a", a);
    subscribeChatThread("conv-b", b);

    const event = {
      type: "read" as const,
      userId: "user-1",
      lastReadAt: "2026-01-01T00:00:00.000Z",
    };
    publishChatThread("conv-a", event);

    expect(a).toHaveBeenCalledTimes(1);
    expect(a).toHaveBeenCalledWith(event);
    expect(b).not.toHaveBeenCalled();
  });

  it("unsubscribe stops delivery", () => {
    const sink = vi.fn();
    const unsub = subscribeChatThread("conv-a", sink);
    expect(chatThreadSubscriberCount("conv-a")).toBe(1);
    unsub();
    expect(chatThreadSubscriberCount("conv-a")).toBe(0);
    publishChatThread("conv-a", {
      type: "read",
      userId: "u",
      lastReadAt: "2026-01-01T00:00:00.000Z",
    });
    expect(sink).not.toHaveBeenCalled();
  });

  it("delivers reaction events to subscribers", () => {
    const sink = vi.fn();
    subscribeChatThread("conv-a", sink);
    const event = {
      type: "reaction" as const,
      messageId: "msg-1",
      conversationId: "conv-a",
      userId: "user-1",
      reaction: 0 as const,
      reactions: {
        0: 1,
        1: 0,
        2: 0,
        3: 0,
        4: 0,
        5: 0,
      },
      reactionCount: 1,
    };
    publishChatThread("conv-a", event);
    expect(sink).toHaveBeenCalledWith(event);
  });

  it("delivers deleted events to subscribers", () => {
    const sink = vi.fn();
    subscribeChatThread("conv-a", sink);
    const event = {
      type: "deleted" as const,
      messageId: "msg-42",
      conversationId: "conv-a",
    };
    publishChatThread("conv-a", event);
    expect(sink).toHaveBeenCalledWith(event);
  });

  it("does not deliver deleted event to a different conversation", () => {
    const sinkA = vi.fn();
    const sinkB = vi.fn();
    subscribeChatThread("conv-a", sinkA);
    subscribeChatThread("conv-b", sinkB);
    publishChatThread("conv-a", {
      type: "deleted",
      messageId: "msg-42",
      conversationId: "conv-a",
    });
    expect(sinkA).toHaveBeenCalledTimes(1);
    expect(sinkB).not.toHaveBeenCalled();
  });
});
