/**
 * Upload ACL: viewer access checks (avatar / post / story / chat).
 */
import type { RowDataPacket } from "mysql2/promise";
import { listAcceptedFriendIds } from "../friends/friendships";
import { getPool } from "../core/pool";
import { PostVisibility } from "~/types/post";
import { type UploadRow } from "./uploadShared";
import { getUploadById } from "./uploadCrud";

/** Short-lived positive ACL decisions (process-local). */
const UPLOAD_ACL_TTL_MS = 10_000;
const uploadAclAllowUntil = new Map<string, number>();
const FRIEND_IDS_TTL_MS = 60_000;
const friendIdsUntil = new Map<string, { until: number; ids: string[] }>();

function rememberUploadAllow(viewerId: string | null, uploadId: string) {
  uploadAclAllowUntil.set(
    `${viewerId ?? ""}:${uploadId}`,
    Date.now() + UPLOAD_ACL_TTL_MS,
  );
}

function wasUploadAllowedRecently(
  viewerId: string | null,
  uploadId: string,
): boolean {
  const key = `${viewerId ?? ""}:${uploadId}`;
  const until = uploadAclAllowUntil.get(key);
  if (!until) return false;
  if (until <= Date.now()) {
    uploadAclAllowUntil.delete(key);
    return false;
  }
  return true;
}

async function cachedFriendIds(viewerId: string): Promise<string[]> {
  const hit = friendIdsUntil.get(viewerId);
  if (hit && hit.until > Date.now()) return hit.ids;
  const ids = await listAcceptedFriendIds(viewerId);
  friendIdsUntil.set(viewerId, {
    ids,
    until: Date.now() + FRIEND_IDS_TTL_MS,
  });
  return ids;
}

async function uploadAccessibleToViewer(
  row: UploadRow,
  viewerId: string | null,
): Promise<boolean> {
  if (viewerId && row.user_id === viewerId) return true;

  const pool = getPool();
  const uploadId = row.id;

  // Single round-trip: avatar OR post OR story OR chat (anonymous: avatar/public post).
  if (!viewerId) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 1 AS ok
       WHERE EXISTS (
         SELECT 1 FROM users WHERE avatar_upload_id = ? LIMIT 1
       )
       OR EXISTS (
         SELECT 1
         FROM post_attachments pa
         INNER JOIN posts p ON p.id = pa.post_id
         WHERE pa.upload_id = ? AND p.visibility = ${PostVisibility.Public}
         LIMIT 1
       )`,
      [uploadId, uploadId],
    );
    return rows.length > 0;
  }

  const friendIds = await cachedFriendIds(viewerId);
  const friendsPostClause =
    friendIds.length === 0
      ? "0"
      : `(
           p.visibility = ${PostVisibility.Friends}
           AND p.user_id IN (${friendIds.map(() => "?").join(",")})
         )`;
  const friendsStoryClause =
    friendIds.length === 0
      ? "0"
      : `s.user_id IN (${friendIds.map(() => "?").join(",")})`;

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 AS ok
     WHERE EXISTS (
       SELECT 1 FROM users WHERE avatar_upload_id = ? LIMIT 1
     )
     OR EXISTS (
       SELECT 1
       FROM post_attachments pa
       INNER JOIN posts p ON p.id = pa.post_id
       WHERE pa.upload_id = ?
         AND (
           p.visibility = ${PostVisibility.Public}
           OR p.user_id = ?
           OR (
             p.visibility = ${PostVisibility.Shared}
             AND p.id IN (
               SELECT a.post_id FROM post_audience a WHERE a.user_id = ?
             )
           )
           OR ${friendsPostClause}
         )
       LIMIT 1
     )
     OR EXISTS (
       SELECT 1 FROM stories s
       WHERE s.upload_id = ?
         AND s.expires_at > UTC_TIMESTAMP(3)
         AND (
           s.user_id = ?
           OR ${friendsStoryClause}
         )
       LIMIT 1
     )
     OR EXISTS (
       SELECT 1
       FROM chat_messages m
       INNER JOIN chat_conversations c ON c.id = m.conversation_id
       WHERE m.upload_id = ?
         AND (c.user_a_id = ? OR c.user_b_id = ?)
       LIMIT 1
     )`,
    [
      uploadId,
      uploadId,
      viewerId,
      viewerId,
      ...friendIds,
      uploadId,
      viewerId,
      ...friendIds,
      uploadId,
      viewerId,
      viewerId,
    ],
  );
  return rows.length > 0;
}

/**
 * True if the viewer may fetch this upload.
 * Anonymous viewers only get uploads attached to public posts or used as
 * anyone's profile avatar (avatars appear on public feed surfaces).
 * Authenticated viewers also get own uploads, shared-audience posts, and live stories.
 */
export async function canViewerAccessUpload(
  viewerId: string | null,
  uploadId: string,
): Promise<boolean> {
  if (wasUploadAllowedRecently(viewerId, uploadId)) return true;
  const row = await getUploadById(uploadId);
  if (!row) return false;
  const allowed = await uploadAccessibleToViewer(row, viewerId);
  if (allowed) rememberUploadAllow(viewerId, uploadId);
  return allowed;
}

/**
 * Single round-trip helper for the download route: ACL + row, or null when
 * denied / missing (callers map null → 404).
 */
export async function resolveUploadForViewer(
  viewerId: string | null,
  uploadId: string,
): Promise<UploadRow | null> {
  const row = await getUploadById(uploadId);
  if (!row) return null;
  if (wasUploadAllowedRecently(viewerId, uploadId)) return row;
  const allowed = await uploadAccessibleToViewer(row, viewerId);
  if (!allowed) return null;
  rememberUploadAllow(viewerId, uploadId);
  return row;
}

/** Test helper — clear process-local upload ACL / friend-id caches. */
export function _resetUploadAccessCachesForTests() {
  uploadAclAllowUntil.clear();
  friendIdsUntil.clear();
}
