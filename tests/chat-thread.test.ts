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
});
