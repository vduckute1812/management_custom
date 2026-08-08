import { describe, expect, it } from "vitest";
import {
  canRequestOlderChatMessages,
  chatThreadOverflows,
  isChatNearTopForOlder,
  isChatStuckToBottom,
  restoreChatScrollAfterPrepend,
  scrollTopForLastMessage,
} from "../utils/chatThreadScroll";

describe("chatThreadScroll", () => {
  it("detects overflow only when content exceeds the viewport", () => {
    expect(chatThreadOverflows(500, 500)).toBe(false);
    expect(chatThreadOverflows(501, 500)).toBe(false);
    expect(chatThreadOverflows(502, 500)).toBe(true);
  });

  it("blocks older loads until the newest page is pinned", () => {
    expect(
      canRequestOlderChatMessages({
        hasMore: true,
        loadingMore: false,
        pinReady: false,
        scrollHeight: 2000,
        clientHeight: 600,
      }),
    ).toBe(false);
  });

  it("does not auto-load older pages when the first page fits the viewport", () => {
    expect(
      canRequestOlderChatMessages({
        hasMore: true,
        loadingMore: false,
        pinReady: true,
        scrollHeight: 400,
        clientHeight: 600,
      }),
    ).toBe(false);
  });

  it("allows auto-load after pin when the thread overflows", () => {
    expect(
      canRequestOlderChatMessages({
        hasMore: true,
        loadingMore: false,
        pinReady: true,
        scrollHeight: 2000,
        clientHeight: 600,
      }),
    ).toBe(true);
  });

  it("allows an explicit Load older click even when content fits", () => {
    expect(
      canRequestOlderChatMessages({
        hasMore: true,
        loadingMore: false,
        pinReady: true,
        userGesture: true,
        scrollHeight: 400,
        clientHeight: 600,
      }),
    ).toBe(true);
  });

  it("still blocks the Load older click until pin is ready", () => {
    expect(
      canRequestOlderChatMessages({
        hasMore: true,
        loadingMore: false,
        pinReady: false,
        userGesture: true,
        scrollHeight: 400,
        clientHeight: 600,
      }),
    ).toBe(false);
  });

  it("tracks stick-to-bottom and near-top thresholds", () => {
    expect(isChatStuckToBottom(1000, 400, 560)).toBe(true); // dist 40
    expect(isChatStuckToBottom(1000, 300, 560)).toBe(false); // dist 140
    expect(isChatNearTopForOlder(0)).toBe(true);
    expect(isChatNearTopForOlder(47)).toBe(true);
    expect(isChatNearTopForOlder(48)).toBe(false);
  });

  it("restores scroll position after prepending older messages", () => {
    expect(restoreChatScrollAfterPrepend(2000, 1000, 50)).toBe(1050);
  });

  it("computes scrollTop that keeps the last message at the bottom", () => {
    expect(scrollTopForLastMessage(400, 600)).toBe(0);
    expect(scrollTopForLastMessage(600, 600)).toBe(0);
    expect(scrollTopForLastMessage(1200, 600)).toBe(600);
  });
});
