/**
 * Pure helpers for chat thread scroll / older-page gating.
 * Kept free of Vue so vitest can cover the open → pin → scroll-up contract.
 */

/** Auto-load older pages only when the scroller actually overflows. */
export function chatThreadOverflows(
  scrollHeight: number,
  clientHeight: number,
): boolean {
  return scrollHeight > clientHeight + 1;
}

/**
 * Whether an older-page fetch may run.
 * - `pinReady`: newest page has been pinned after open/hydrate
 * - `userGesture`: explicit "Load older" click bypasses overflow check
 * - otherwise require an overflowing thread (user can scroll up)
 */
export function canRequestOlderChatMessages(options: {
  hasMore: boolean;
  loadingMore: boolean;
  pinReady: boolean;
  userGesture?: boolean;
  scrollHeight: number;
  clientHeight: number;
}): boolean {
  if (!options.hasMore || options.loadingMore || !options.pinReady) {
    return false;
  }
  if (options.userGesture) return true;
  return chatThreadOverflows(options.scrollHeight, options.clientHeight);
}

/** Stick-to-bottom when within this many px of the end. */
export const CHAT_STICK_BOTTOM_PX = 48;

export function isChatStuckToBottom(
  scrollHeight: number,
  scrollTop: number,
  clientHeight: number,
  thresholdPx = CHAT_STICK_BOTTOM_PX,
): boolean {
  return scrollHeight - scrollTop - clientHeight < thresholdPx;
}

/** Near-top threshold that triggers older-page load while scrolling up. */
export const CHAT_LOAD_OLDER_TOP_PX = 48;

export function isChatNearTopForOlder(
  scrollTop: number,
  thresholdPx = CHAT_LOAD_OLDER_TOP_PX,
): boolean {
  return scrollTop < thresholdPx;
}

/** Preserve viewport after prepending older messages. */
export function restoreChatScrollAfterPrepend(
  nextScrollHeight: number,
  prevScrollHeight: number,
  prevScrollTop: number,
): number {
  return nextScrollHeight - prevScrollHeight + prevScrollTop;
}
