/**
 * Friendship shared mappers, peer SELECT, and list helpers.
 */
import { DomainError } from "~/server/utils/http";
import type { RowDataPacket } from "mysql2/promise";
import {
  FriendshipStatus,
  toFriendshipStatus,
  type FriendshipRow,
  type FriendshipUser,
} from "~/types/friendship";
import { resolveDisplayName } from "~/utils/displayName";
import { dbToISO, isoToDB } from "../core/datetime";
import { avatarUrlFromUploadId } from "../core/mappers";
import { getPool } from "../core/pool";
import {
  encodeTimestampCursor,
  parseTimestampCursor,
} from "../core/timestampCursor";

export interface FriendshipPeerRow extends RowDataPacket {
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

export function toPeer(
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

export function toFriendship(
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

export const PEER_SELECT = `
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

export async function findPairRow(
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

export interface FriendshipPage {
  rows: FriendshipRow[];
  nextCursor: string | null;
}

export interface FriendshipListOptions {
  limit?: number;
  cursor?: string | null;
}

export function friendshipPage(
  rows: FriendshipPeerRow[],
  limit: number,
  opts?: { wireEmail?: boolean },
): FriendshipPage {
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const last = pageRows[pageRows.length - 1];
  return {
    rows: pageRows.map((row) => toFriendship(row, opts)),
    nextCursor:
      hasMore && last
        ? encodeTimestampCursor(dbToISO(last.created_at), last.id)
        : null,
  };
}

export function friendshipCursorClause(
  cursor: string | null | undefined,
  params: unknown[],
): string {
  if (!cursor) return "";
  const parsed = parseTimestampCursor(cursor);
  const timestamp = isoToDB(parsed.timestamp);
  params.push(timestamp, timestamp, parsed.id);
  return `AND (
    f.created_at < ?
    OR (f.created_at = ? AND f.id < ?)
  )`;
}

export async function loadFriendshipForUser(
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
