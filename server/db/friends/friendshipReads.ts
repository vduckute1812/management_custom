/**
 * Friendship reads: areFriends, lists, overview, incoming count.
 */
import {
  FriendshipStatus,
  toFriendshipStatus,
  type FriendshipRow,
} from "~/types/friendship";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "../core/pool";
import {
  findPairRow,
  friendshipCursorClause,
  friendshipPage,
  PEER_SELECT,
  type FriendshipPage,
  type FriendshipPeerRow,
  type FriendshipListOptions,
} from "./friendshipShared";

export async function areFriends(
  userA: string,
  userB: string,
): Promise<boolean> {
  if (!userA || !userB || userA === userB) return false;
  const row = await findPairRow(userA, userB);
  return (
    row != null && toFriendshipStatus(row.status) === FriendshipStatus.Accepted
  );
}

/** Peer user ids with an Accepted friendship (for feed/story ACL `IN` lists). */
export async function countIncomingFriendRequests(
  userId: string,
): Promise<number> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt
     FROM friendships
     WHERE addressee_id = ? AND status = ?`,
    [userId, FriendshipStatus.Pending],
  );
  return Number(rows[0]?.cnt ?? 0);
}

export async function listFriends(
  userId: string,
  options: FriendshipListOptions = {},
): Promise<FriendshipPage> {
  const pool = getPool();
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const params: unknown[] = [userId, FriendshipStatus.Accepted, userId, userId];
  const cursorClause = friendshipCursorClause(options.cursor, params);
  params.push(limit + 1);
  const [rows] = await pool.query<FriendshipPeerRow[]>(
    `${PEER_SELECT}
     WHERE f.status = ?
       AND (f.requester_id = ? OR f.addressee_id = ?)
       ${cursorClause}
     ORDER BY f.created_at DESC, f.id DESC
     LIMIT ?`,
    params,
  );
  return friendshipPage(rows, limit, { wireEmail: true });
}

export async function listIncomingFriendRequests(
  userId: string,
  options: FriendshipListOptions = {},
): Promise<FriendshipPage> {
  const pool = getPool();
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const params: unknown[] = [userId, FriendshipStatus.Pending, userId];
  const cursorClause = friendshipCursorClause(options.cursor, params);
  params.push(limit + 1);
  const [rows] = await pool.query<FriendshipPeerRow[]>(
    `${PEER_SELECT}
     WHERE f.status = ?
       AND f.addressee_id = ?
       ${cursorClause}
     ORDER BY f.created_at DESC, f.id DESC
     LIMIT ?`,
    params,
  );
  return friendshipPage(rows, limit);
}

export async function listOutgoingFriendRequests(
  userId: string,
  options: FriendshipListOptions = {},
): Promise<FriendshipPage> {
  const pool = getPool();
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const params: unknown[] = [userId, FriendshipStatus.Pending, userId];
  const cursorClause = friendshipCursorClause(options.cursor, params);
  params.push(limit + 1);
  const [rows] = await pool.query<FriendshipPeerRow[]>(
    `${PEER_SELECT}
     WHERE f.status = ?
       AND f.requester_id = ?
       ${cursorClause}
     ORDER BY f.created_at DESC, f.id DESC
     LIMIT ?`,
    params,
  );
  return friendshipPage(rows, limit);
}

export async function listFriendshipOverview(
  userId: string,
  options: {
    limit?: number;
    friendsCursor?: string | null;
    incomingCursor?: string | null;
    outgoingCursor?: string | null;
  } = {},
): Promise<{
  friends: FriendshipRow[];
  incoming: FriendshipRow[];
  outgoing: FriendshipRow[];
  incomingTotal: number;
  nextCursors: {
    friends: string | null;
    incoming: string | null;
    outgoing: string | null;
  };
}> {
  const [friends, incoming, outgoing, incomingTotal] = await Promise.all([
    listFriends(userId, {
      limit: options.limit,
      cursor: options.friendsCursor,
    }),
    listIncomingFriendRequests(userId, {
      limit: options.limit,
      cursor: options.incomingCursor,
    }),
    listOutgoingFriendRequests(userId, {
      limit: options.limit,
      cursor: options.outgoingCursor,
    }),
    countIncomingFriendRequests(userId),
  ]);
  return {
    friends: friends.rows,
    incoming: incoming.rows,
    outgoing: outgoing.rows,
    incomingTotal,
    nextCursors: {
      friends: friends.nextCursor,
      incoming: incoming.nextCursor,
      outgoing: outgoing.nextCursor,
    },
  };
}
