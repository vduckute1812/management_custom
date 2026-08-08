/**
 * Upload ACL: viewer access checks (avatar / post / story / chat).
 *
 * Positive decisions cache the allowed `UploadRow` for a short TTL so the
 * download hot path (`resolveUploadForViewer`) can skip SQL on repeat hits.
 * Denies stay uncached (fail closed). Same ~10s staleness window as before.
 */
import { listAcceptedFriendIds } from "../friends/friendshipCache";
import { getPool } from "../core/pool";
import { PostVisibility, toUploadKind } from "~/types/post";
import { type UploadRow } from "./uploadShared";

/** Short-lived positive ACL + row cache (process-local). */
const UPLOAD_ACL_TTL_MS = 10_000;
const UPLOAD_ACL_CACHE_MAX = 500;

type CachedAllow = { until: number; row: UploadRow };
const uploadAclAllowCache = new Map<string, CachedAllow>();

function cacheKey(viewerId: string | null, uploadId: string): string {
  return `${viewerId ?? ""}:${uploadId}`;
}

function cloneUploadRow(row: UploadRow): UploadRow {
  return { ...row, kind: toUploadKind(row.kind) };
}

function rememberUploadAllow(
  viewerId: string | null,
  uploadId: string,
  row: UploadRow,
) {
  if (uploadAclAllowCache.size >= UPLOAD_ACL_CACHE_MAX) {
    const oldest = uploadAclAllowCache.keys().next().value;
    if (oldest !== undefined) uploadAclAllowCache.delete(oldest);
  }
  uploadAclAllowCache.set(cacheKey(viewerId, uploadId), {
    until: Date.now() + UPLOAD_ACL_TTL_MS,
    row: cloneUploadRow(row),
  });
}

/** Cached allowed row, or null on miss / expiry. Cloned so callers cannot mutate cache. */
function getCachedAllowedUpload(
  viewerId: string | null,
  uploadId: string,
): UploadRow | null {
  const key = cacheKey(viewerId, uploadId);
  const hit = uploadAclAllowCache.get(key);
  if (!hit) return null;
  if (hit.until <= Date.now()) {
    uploadAclAllowCache.delete(key);
    return null;
  }
  return cloneUploadRow(hit.row);
}

function mapUploadRow(row: UploadRow): UploadRow {
  return cloneUploadRow(row);
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
  if (getCachedAllowedUpload(viewerId, uploadId)) return true;
  const row = await fetchUploadIfAccessible(viewerId, uploadId);
  if (!row) return false;
  rememberUploadAllow(viewerId, uploadId, row);
  return true;
}

/**
 * ACL + row for the download route, or null when denied / missing
 * (callers map null → 404). Cache hits return the row with no SQL.
 */
export async function resolveUploadForViewer(
  viewerId: string | null,
  uploadId: string,
): Promise<UploadRow | null> {
  const cached = getCachedAllowedUpload(viewerId, uploadId);
  if (cached) return cached;
  const row = await fetchUploadIfAccessible(viewerId, uploadId);
  if (!row) return null;
  rememberUploadAllow(viewerId, uploadId, row);
  return row;
}

/** Test helper — clear process-local positive upload ACL cache. */
export function _resetUploadAccessCachesForTests() {
  uploadAclAllowCache.clear();
}

/** Drop cached allows for a viewer (call on friendship graph changes). */
export function invalidateUploadAccessCacheForViewer(viewerId: string) {
  if (!viewerId) return;
  const prefix = `${viewerId}:`;
  for (const key of uploadAclAllowCache.keys()) {
    if (key.startsWith(prefix)) uploadAclAllowCache.delete(key);
  }
}

/** Test helper — positive-cache entry count (bounded map). */
export function _uploadAccessCacheSizeForTests() {
  return uploadAclAllowCache.size;
}
