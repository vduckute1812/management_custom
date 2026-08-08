/**
 * Friendship mutations: request, accept, delete.
 */
import { DomainError } from "~/server/utils/http";
import type { RowDataPacket } from "mysql2/promise";
import {
  FriendshipStatus,
  toFriendshipStatus,
  type FriendshipRow,
} from "~/types/friendship";
import { generateId, nowISO } from "../core/ids";
import { isoToDB } from "../core/datetime";
import { getPool } from "../core/pool";
import { findPairRow, loadFriendshipForUser } from "./friendshipShared";
import { invalidateAcceptedFriendIdsCache } from "./friendshipCache";
import { invalidateUploadAccessCacheForViewer } from "../feed/uploadAccess";

function invalidateFriendshipAclCaches(userA: string, userB: string) {
  invalidateAcceptedFriendIdsCache(userA);
  invalidateAcceptedFriendIdsCache(userB);
  // Friends-visibility media may have been positively cached for either party.
  invalidateUploadAccessCacheForViewer(userA);
  invalidateUploadAccessCacheForViewer(userB);
}

export async function requestFriendship(
  requesterId: string,
  addresseeId: string,
): Promise<FriendshipRow> {
  if (requesterId === addresseeId) {
    throw new DomainError(400, "Cannot friend yourself");
  }

  const pool = getPool();
  const [peerRows] = await pool.query<RowDataPacket[]>(
    "SELECT id FROM users WHERE id = ? LIMIT 1",
    [addresseeId],
  );
  if (!peerRows.length) {
    throw new DomainError(404, "User not found");
  }

  const existing = await findPairRow(requesterId, addresseeId);
  if (existing) {
    const status = toFriendshipStatus(existing.status);
    if (status === FriendshipStatus.Accepted) {
      throw new DomainError(409, "Already friends");
    }
    // Reciprocal pending request → accept theirs.
    if (
      existing.addressee_id === requesterId &&
      existing.requester_id === addresseeId
    ) {
      return acceptFriendship(requesterId, String(existing.id));
    }
    // Own pending request already exists.
    return loadFriendshipForUser(requesterId, String(existing.id));
  }

  const id = generateId("frn");
  const now = nowISO();
  await pool.query(
    `INSERT INTO friendships
       (id, requester_id, addressee_id, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      id,
      requesterId,
      addresseeId,
      FriendshipStatus.Pending,
      isoToDB(now),
      isoToDB(now),
    ],
  );
  return loadFriendshipForUser(requesterId, id);
}

export async function acceptFriendship(
  userId: string,
  friendshipId: string,
): Promise<FriendshipRow> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, requester_id, addressee_id, status
     FROM friendships WHERE id = ? LIMIT 1`,
    [friendshipId],
  );
  const row = rows[0];
  if (!row) {
    throw new DomainError(404, "Friendship not found");
  }
  if (row.addressee_id !== userId) {
    throw new DomainError(403, "Only the addressee can accept this request");
  }
  if (toFriendshipStatus(row.status) !== FriendshipStatus.Pending) {
    throw new DomainError(409, "Friendship is not pending");
  }

  const now = nowISO();
  await pool.query(
    `UPDATE friendships
     SET status = ?, updated_at = ?
     WHERE id = ? AND status = ?`,
    [
      FriendshipStatus.Accepted,
      isoToDB(now),
      friendshipId,
      FriendshipStatus.Pending,
    ],
  );
  invalidateFriendshipAclCaches(
    String(row.requester_id),
    String(row.addressee_id),
  );
  return loadFriendshipForUser(userId, friendshipId);
}

/** Cancel pending, decline pending, or unfriend — either party. */
export async function deleteFriendship(
  userId: string,
  friendshipId: string,
): Promise<void> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT requester_id, addressee_id FROM friendships WHERE id = ? LIMIT 1`,
    [friendshipId],
  );
  const pair = rows[0];
  const [result] = await pool.query(
    `DELETE FROM friendships
     WHERE id = ?
       AND (requester_id = ? OR addressee_id = ?)`,
    [friendshipId, userId, userId],
  );
  const affected = Number(
    (result as { affectedRows?: number }).affectedRows ?? 0,
  );
  if (!affected) {
    throw new DomainError(404, "Friendship not found");
  }
  if (pair) {
    invalidateFriendshipAclCaches(
      String(pair.requester_id),
      String(pair.addressee_id),
    );
  }
}
