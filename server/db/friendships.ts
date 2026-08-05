/**
 * Friendships — Facebook-style request / accept graph.
 */
import { DomainError } from "~/server/utils/http";
import type { RowDataPacket } from "mysql2/promise";
import {
  FriendshipStatus,
  toFriendshipStatus,
  type FriendshipRow,
  type FriendshipUser,
} from "../../types/friendship";
import { resolveDisplayName } from "../../utils/displayName";
import { dbToISO, isoToDB } from "./datetime";
import { generateId, nowISO } from "./ids";
import { avatarUrlFromUploadId } from "./mappers";
import { getPool } from "./pool";

interface FriendshipPeerRow extends RowDataPacket {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: number;
  created_at: string;
  updated_at: string;
  peer_id: string;
  peer_name: string | null;
  peer_email: string;
  peer_avatar_upload_id: string | null;
}

function toPeer(
  row: {
    peer_id: string;
    peer_name: string | null;
    peer_email: string;
    peer_avatar_upload_id: string | null;
  },
  opts?: { wireEmail?: boolean },
): FriendshipUser {
  return {
    id: row.peer_id,
    name: resolveDisplayName(row.peer_name, row.peer_email),
    // Accepted friends may see email (chat/compose); pending peers stay masked.
    email: opts?.wireEmail ? row.peer_email : "",
    avatarUrl: avatarUrlFromUploadId(row.peer_avatar_upload_id) ?? null,
  };
}

function toFriendship(
  row: FriendshipPeerRow,
  opts?: { wireEmail?: boolean },
): FriendshipRow {
  return {
    id: row.id,
    requesterId: row.requester_id,
    addresseeId: row.addressee_id,
    status: toFriendshipStatus(row.status),
    createdAt: dbToISO(row.created_at),
    updatedAt: dbToISO(row.updated_at),
    peer: toPeer(row, opts),
  };
}

const PEER_SELECT = `
  SELECT
    f.id,
    f.requester_id,
    f.addressee_id,
    f.status,
    f.created_at,
    f.updated_at,
    peer.id AS peer_id,
    peer.name AS peer_name,
    peer.email AS peer_email,
    peer.avatar_upload_id AS peer_avatar_upload_id
  FROM friendships f
  INNER JOIN users peer
    ON peer.id = IF(f.requester_id = ?, f.addressee_id, f.requester_id)
`;

async function findPairRow(
  userA: string,
  userB: string,
): Promise<RowDataPacket | null> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, requester_id, addressee_id, status
     FROM friendships
     WHERE (requester_id = ? AND addressee_id = ?)
        OR (requester_id = ? AND addressee_id = ?)
     LIMIT 1`,
    [userA, userB, userB, userA],
  );
  return rows[0] ?? null;
}

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
export async function listAcceptedFriendIds(userId: string): Promise<string[]> {
  if (!userId) return [];
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT IF(requester_id = ?, addressee_id, requester_id) AS peer_id
     FROM friendships
     WHERE status = ?
       AND (requester_id = ? OR addressee_id = ?)`,
    [userId, FriendshipStatus.Accepted, userId, userId],
  );
  return rows.map((r) => String(r.peer_id));
}

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

export async function listFriends(userId: string): Promise<FriendshipRow[]> {
  const pool = getPool();
  const [rows] = await pool.query<FriendshipPeerRow[]>(
    `${PEER_SELECT}
     WHERE f.status = ?
       AND (f.requester_id = ? OR f.addressee_id = ?)
     ORDER BY peer.name ASC, peer.email ASC`,
    [userId, FriendshipStatus.Accepted, userId, userId],
  );
  return rows.map((row) => toFriendship(row, { wireEmail: true }));
}

export async function listIncomingFriendRequests(
  userId: string,
): Promise<FriendshipRow[]> {
  const pool = getPool();
  const [rows] = await pool.query<FriendshipPeerRow[]>(
    `${PEER_SELECT}
     WHERE f.status = ?
       AND f.addressee_id = ?
     ORDER BY f.created_at DESC`,
    [userId, FriendshipStatus.Pending, userId],
  );
  return rows.map((row) => toFriendship(row));
}

export async function listOutgoingFriendRequests(
  userId: string,
): Promise<FriendshipRow[]> {
  const pool = getPool();
  const [rows] = await pool.query<FriendshipPeerRow[]>(
    `${PEER_SELECT}
     WHERE f.status = ?
       AND f.requester_id = ?
     ORDER BY f.created_at DESC`,
    [userId, FriendshipStatus.Pending, userId],
  );
  return rows.map((row) => toFriendship(row));
}

export async function listFriendshipOverview(userId: string): Promise<{
  friends: FriendshipRow[];
  incoming: FriendshipRow[];
  outgoing: FriendshipRow[];
}> {
  const [friends, incoming, outgoing] = await Promise.all([
    listFriends(userId),
    listIncomingFriendRequests(userId),
    listOutgoingFriendRequests(userId),
  ]);
  return { friends, incoming, outgoing };
}

async function loadFriendshipForUser(
  userId: string,
  friendshipId: string,
): Promise<FriendshipRow> {
  const pool = getPool();
  const [rows] = await pool.query<FriendshipPeerRow[]>(
    `${PEER_SELECT}
     WHERE f.id = ?
       AND (f.requester_id = ? OR f.addressee_id = ?)
     LIMIT 1`,
    [userId, friendshipId, userId, userId],
  );
  const row = rows[0];
  if (!row) {
    throw new DomainError(404, "Friendship not found");
  }
  const accepted = toFriendshipStatus(row.status) === FriendshipStatus.Accepted;
  return toFriendship(row, { wireEmail: accepted });
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
  return loadFriendshipForUser(userId, friendshipId);
}

/** Cancel pending, decline pending, or unfriend — either party. */
export async function deleteFriendship(
  userId: string,
  friendshipId: string,
): Promise<void> {
  const pool = getPool();
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
}
