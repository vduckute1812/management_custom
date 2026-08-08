/**
 * Upload ACL: viewer access checks (avatar / post / story / chat).
 *
 * Hot path (`resolveUploadForViewer`) loads the row only when ACL passes —
 * one SQL round-trip for owner / avatar / post / story / chat gates.
 */
import { listAcceptedFriendIds } from "../friends/friendships";
import { getPool } from "../core/pool";
import { PostVisibility, toUploadKind } from "~/types/post";
import { type UploadRow } from "./uploadShared";

/** Short-lived positive ACL decisions (process-local). */
const UPLOAD_ACL_TTL_MS = 10_000;
const uploadAclAllowUntil = new Map<string, number>();

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

function mapUploadRow(row: UploadRow): UploadRow {
  return { ...row, kind: toUploadKind(row.kind) };
}

/**
 * Fetch the upload row only if the viewer may access it.
 * Anonymous: avatar or public-post attachment.
 * Authenticated: own upload, avatar, visible post/story, or chat participant.
 */
async function fetchUploadIfAccessible(
  viewerId: string | null,
  uploadId: string,
): Promise<UploadRow | null> {
  const pool = getPool();
  const selectCols = `u.id, u.user_id, u.file_name, u.mime, u.kind, u.size_bytes, u.storage_key, u.created_at`;

  if (!viewerId) {
    const [rows] = await pool.query<UploadRow[]>(
      `SELECT ${selectCols}
       FROM uploads u
       WHERE u.id = ?
         AND (
           EXISTS (
             SELECT 1 FROM users WHERE avatar_upload_id = u.id LIMIT 1
           )
           OR EXISTS (
             SELECT 1
             FROM post_attachments pa
             INNER JOIN posts p ON p.id = pa.post_id
             WHERE pa.upload_id = u.id
               AND p.visibility = ${PostVisibility.Public}
             LIMIT 1
           )
         )
       LIMIT 1`,
      [uploadId],
    );
    const row = rows[0];
    return row ? mapUploadRow(row) : null;
  }

  // Use friendshipCache (invalidated on accept/unfriend) — do not layer a
  // second process-local friend list that would outlive graph mutations.
  const friendIds = await listAcceptedFriendIds(viewerId);
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

  const [rows] = await pool.query<UploadRow[]>(
    `SELECT ${selectCols}
     FROM uploads u
     WHERE u.id = ?
       AND (
         u.user_id = ?
         OR EXISTS (
           SELECT 1 FROM users WHERE avatar_upload_id = u.id LIMIT 1
         )
         OR EXISTS (
           SELECT 1
           FROM post_attachments pa
           INNER JOIN posts p ON p.id = pa.post_id
           WHERE pa.upload_id = u.id
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
           WHERE s.upload_id = u.id
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
           WHERE m.upload_id = u.id
             AND (c.user_a_id = ? OR c.user_b_id = ?)
           LIMIT 1
         )
       )
     LIMIT 1`,
    [
      uploadId,
      viewerId,
      viewerId,
      viewerId,
      ...friendIds,
      viewerId,
      ...friendIds,
      viewerId,
      viewerId,
    ],
  );
  const row = rows[0];
  return row ? mapUploadRow(row) : null;
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
  const row = await fetchUploadIfAccessible(viewerId, uploadId);
  if (!row) return false;
  rememberUploadAllow(viewerId, uploadId);
  return true;
}

/**
 * Single round-trip helper for the download route: ACL + row, or null when
 * denied / missing (callers map null → 404).
 */
export async function resolveUploadForViewer(
  viewerId: string | null,
  uploadId: string,
): Promise<UploadRow | null> {
  if (wasUploadAllowedRecently(viewerId, uploadId)) {
    // Cache only stores allow/deny — still need the row for the download path.
    const { getUploadById } = await import("./uploadCrud");
    return getUploadById(uploadId);
  }
  const row = await fetchUploadIfAccessible(viewerId, uploadId);
  if (!row) return null;
  rememberUploadAllow(viewerId, uploadId);
  return row;
}

/** Test helper — clear process-local positive upload ACL cache. */
export function _resetUploadAccessCachesForTests() {
  uploadAclAllowUntil.clear();
}
