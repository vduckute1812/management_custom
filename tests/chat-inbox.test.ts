import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetChatInboxForTests,
  chatInboxSubscriberCount,
  publishChatInbox,
  subscribeChatInbox,
} from "../server/utils/chatInbox";

describe("chatInbox fan-out", () => {
  beforeEach(() => {
    _resetChatInboxForTests();
  });

  it("delivers payloads only to the subscribed user", () => {
    const a = vi.fn();
    const b = vi.fn();
    subscribeChatInbox("user-a", a);
    subscribeChatInbox("user-b", b);

    const payload = { unreadTotal: 2, latest: null };
    publishChatInbox("user-a", payload);

    expect(a).toHaveBeenCalledTimes(1);
    expect(a).toHaveBeenCalledWith(payload);
    expect(b).not.toHaveBeenCalled();
  });

  it("unsubscribe stops delivery and clears empty sets", () => {
    const sink = vi.fn();
    const unsub = subscribeChatInbox("user-a", sink);
    expect(chatInboxSubscriberCount("user-a")).toBe(1);

    unsub();
    expect(chatInboxSubscriberCount("user-a")).toBe(0);

    publishChatInbox("user-a", { unreadTotal: 1, latest: null });
    expect(sink).not.toHaveBeenCalled();
  });

  it("supports multiple tabs for the same user", () => {
    const tab1 = vi.fn();
    const tab2 = vi.fn();
    subscribeChatInbox("user-a", tab1);
    subscribeChatInbox("user-a", tab2);

    publishChatInbox("user-a", { unreadTotal: 3, latest: null });
    expect(tab1).toHaveBeenCalledTimes(1);
    expect(tab2).toHaveBeenCalledTimes(1);
    expect(chatInboxSubscriberCount("user-a")).toBe(2);
  });
});
