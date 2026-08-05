/**
 * Friendships — Facebook-style request / accept graph.
 * Status is TINYINT end-to-end (never string tokens).
 */

export const FriendshipStatus = {
  Pending: 0,
  Accepted: 1,
} as const;
export type FriendshipStatus =
  (typeof FriendshipStatus)[keyof typeof FriendshipStatus];
export const FRIENDSHIP_STATUSES = [
  FriendshipStatus.Pending,
  FriendshipStatus.Accepted,
] as const;

export function isFriendshipStatus(value: unknown): value is FriendshipStatus {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    (FRIENDSHIP_STATUSES as readonly number[]).includes(value)
  );
}

export function toFriendshipStatus(value: unknown): FriendshipStatus {
  const n = typeof value === "string" ? Number(value) : value;
  return isFriendshipStatus(n) ? n : FriendshipStatus.Pending;
}

export interface FriendshipUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

export interface FriendshipRow {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: FriendshipStatus;
  createdAt: string;
  updatedAt: string;
  peer: FriendshipUser;
}
