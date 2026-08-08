/**
 * Friends service — thin `*ForUser` wrappers over friendship DB ops.
 * Handlers stay auth/parse-only; DomainError for missing route ids.
 */
import type { z } from "zod";
import {
  acceptFriendship,
  countIncomingFriendRequests,
  deleteFriendship,
  listFriends,
  listFriendshipOverview,
  listIncomingFriendRequests,
  listOutgoingFriendRequests,
  requestFriendship,
  type FriendshipPage,
} from "~/server/db/friends/friendships";
import { DomainError } from "~/server/utils/http";
import type {
  friendshipPageQuerySchema,
  friendshipRequestBodySchema,
  friendshipsQuerySchema,
} from "~/server/schemas";
import type { FriendshipRow } from "~/types/friendship";

type PageQuery = z.infer<typeof friendshipPageQuerySchema>;
type OverviewQuery = z.infer<typeof friendshipsQuerySchema>;
type RequestBody = z.infer<typeof friendshipRequestBodySchema>;

function requireFriendshipId(id: string | undefined): string {
  if (!id?.trim()) {
    throw new DomainError(400, "Missing id");
  }
  return id.trim();
}

export async function listFriendshipOverviewForUser(
  userId: string,
  query: OverviewQuery,
) {
  return listFriendshipOverview(userId, query);
}

export async function listFriendsForUser(
  userId: string,
  query: PageQuery,
): Promise<FriendshipPage> {
  return listFriends(userId, query);
}

export async function listIncomingFriendRequestsForUser(
  userId: string,
  query: PageQuery,
): Promise<FriendshipPage> {
  return listIncomingFriendRequests(userId, query);
}

export async function listOutgoingFriendRequestsForUser(
  userId: string,
  query: PageQuery,
): Promise<FriendshipPage> {
  return listOutgoingFriendRequests(userId, query);
}

export async function countIncomingFriendRequestsForUser(
  userId: string,
): Promise<{ count: number }> {
  const count = await countIncomingFriendRequests(userId);
  return { count };
}

export async function requestFriendshipForUser(
  userId: string,
  body: RequestBody,
): Promise<{ friendship: FriendshipRow }> {
  const friendship = await requestFriendship(userId, body.userId);
  return { friendship };
}

export async function acceptFriendshipForUser(
  userId: string,
  friendshipId: string | undefined,
): Promise<{ friendship: FriendshipRow }> {
  const id = requireFriendshipId(friendshipId);
  const friendship = await acceptFriendship(userId, id);
  return { friendship };
}

export async function deleteFriendshipForUser(
  userId: string,
  friendshipId: string | undefined,
): Promise<{ ok: true }> {
  const id = requireFriendshipId(friendshipId);
  await deleteFriendship(userId, id);
  return { ok: true };
}
