import { DomainError } from "~/server/utils/http";
import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import { dbToISO, isoToDB } from "./datetime";
import { listAcceptedFriendIds } from "./friendships";
import { generateId, nowISO } from "./ids";
import { getPool } from "./pool";
import type { UploadKind, UploadRecord } from "../../types/post";
import {
  PostVisibility,
  UPLOAD_KIND_STORAGE_FOLDER,
  toUploadKind,
} from "../../types/post";
import {
  assertR2Configured,
  r2DeleteObject,
  r2GetObjectBuffer,
  r2PutObject,
  r2SignedGetUrl,
} from "../utils/r2";

// The allowlist and per-type size ceilings live in `~/utils/uploadPolicy`,
// shared with the client so both sides enforce the same rules.

interface UploadRow extends RowDataPacket {
  id: string;
  user_id: string;
  file_name: string;
  mime: string;
  kind: UploadKind;
  size_bytes: number;
  storage_key: string;
  created_at: string;
}

function toRecord(row: UploadRow): UploadRecord {
  const kind = toUploadKind(row.kind);
  return {
    id: row.id,
    fileName: row.file_name,
    mime: row.mime,
    kind,
    sizeBytes: Number(row.size_bytes),
    // App-proxied URL: ACL checked, then redirect to a short R2 signed URL.
    url: `/api/uploads/${row.id}`,
  };
}

export async function createUpload(args: {
  userId: string;
  fileName: string;
  mime: string;
  kind: UploadKind;
  sizeBytes: number;
  data: Buffer;
}): Promise<UploadRecord> {
  assertR2Configured();

  const pool = getPool();
  const id = generateId("upl");
  const now = nowISO();
  const d = new Date(now);
  const yyyy = String(d.getUTCFullYear());
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const safeName = args.fileName.replace(/[^\w.\-()+ ]+/g, "_").slice(0, 180);
  const kind = toUploadKind(args.kind);
  // S3/R2 keys always use forward slashes. Group by attachment/message kind
  // (`image` / `document` / `audio`) so chat media and feed assets are easy
  // to browse in the bucket. Existing rows keep their legacy keys as stored.
  const storageKey = `uploads/${UPLOAD_KIND_STORAGE_FOLDER[kind]}/${yyyy}/${mm}/${id}_${safeName}`;

  await r2PutObject({
    key: storageKey,
    body: args.data,
    contentType: args.mime,
  });

  try {
    await pool.query(
      `INSERT INTO uploads
         (id, user_id, file_name, mime, kind, size_bytes, storage_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        args.userId,
        args.fileName.slice(0, 255),
        args.mime,
        kind,
        args.sizeBytes,
        storageKey,
        isoToDB(now),
      ],
    );
  } catch (err) {
    await r2DeleteObject(storageKey).catch(() => undefined);
    throw err;
  }

  return {
    id,
    fileName: args.fileName.slice(0, 255),
    mime: args.mime,
    kind,
    sizeBytes: args.sizeBytes,
    url: `/api/uploads/${id}`,
  };
}

export async function getUploadById(id: string): Promise<UploadRow | null> {
  const pool = getPool();
  const [rows] = await pool.query<UploadRow[]>(
    `SELECT id, user_id, file_name, mime, kind, size_bytes, storage_key, created_at
     FROM uploads WHERE id = ? LIMIT 1`,
    [id],
  );
  const row = rows[0];
  return row ? { ...row, kind: toUploadKind(row.kind) } : null;
}

export async function getUploadRecord(
  id: string,
): Promise<UploadRecord | null> {
  const row = await getUploadById(id);
  return row ? toRecord(row) : null;
}

export async function readUploadFile(storageKey: string): Promise<Buffer> {
  const { body } = await r2GetObjectBuffer(storageKey);
  return body;
}

export async function signedUploadUrl(storageKey: string): Promise<string> {
  return r2SignedGetUrl(storageKey);
}

/** Short-lived positive ACL decisions (process-local). */
const UPLOAD_ACL_TTL_MS = 30_000;
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

  // Profile avatars are intentionally public — they show next to authors on
  // public posts and stories even for anonymous visitors.
  const [avatarRows] = await pool.query<RowDataPacket[]>(
    `SELECT 1 FROM users WHERE avatar_upload_id = ? LIMIT 1`,
    [uploadId],
  );
  if (avatarRows.length) return true;

  if (!viewerId) {
    const [publicRows] = await pool.query<RowDataPacket[]>(
      `SELECT pa.post_id
       FROM post_attachments pa
       INNER JOIN posts p ON p.id = pa.post_id
       WHERE pa.upload_id = ? AND p.visibility = ${PostVisibility.Public}
       LIMIT 1`,
      [uploadId],
    );
    return publicRows.length > 0;
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

  const [postRows] = await pool.query<RowDataPacket[]>(
    `SELECT pa.post_id
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
     LIMIT 1`,
    [uploadId, viewerId, viewerId, ...friendIds],
  );
  if (postRows.length) return true;

  const [storyRows] = await pool.query<RowDataPacket[]>(
    `SELECT s.id FROM stories s
     WHERE s.upload_id = ?
       AND s.expires_at > UTC_TIMESTAMP(3)
       AND (
         s.user_id = ?
         OR ${friendsStoryClause}
       )
     LIMIT 1`,
    [uploadId, viewerId, ...friendIds],
  );
  if (storyRows.length) return true;

  // Chat attachments: either participant of the conversation may fetch.
  const [chatRows] = await pool.query<RowDataPacket[]>(
    `SELECT 1
     FROM chat_messages m
     INNER JOIN chat_conversations c ON c.id = m.conversation_id
     WHERE m.upload_id = ?
       AND (c.user_a_id = ? OR c.user_b_id = ?)
     LIMIT 1`,
    [uploadId, viewerId, viewerId],
  );
  return chatRows.length > 0;
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

export async function assertOwnedUploads(
  userId: string,
  uploadIds: string[],
): Promise<UploadRow[]> {
  if (!uploadIds.length) return [];
  const unique = [...new Set(uploadIds)];
  const pool = getPool();
  const placeholders = unique.map(() => "?").join(",");
  const [rows] = await pool.query<UploadRow[]>(
    `SELECT id, user_id, file_name, mime, kind, size_bytes, storage_key, created_at
     FROM uploads
     WHERE id IN (${placeholders}) AND user_id = ?`,
    [...unique, userId],
  );
  if (rows.length !== unique.length) {
    throw new DomainError(400, "One or more uploads are invalid");
  }
  return rows.map((row) => ({ ...row, kind: toUploadKind(row.kind) }));
}

/** Storage keys for every upload owned by a user (pre-delete R2 sweep). */
export async function listStorageKeysForUser(
  userId: string,
): Promise<string[]> {
  const pool = getPool();
  const [rows] = await pool.query<(RowDataPacket & { storage_key: string })[]>(
    `SELECT storage_key FROM uploads WHERE user_id = ?`,
    [userId],
  );
  return rows.map((r) => r.storage_key).filter(Boolean);
}

async function safeR2Delete(key: string): Promise<void> {
  if (!key) return;
  try {
    assertR2Configured();
    await r2DeleteObject(key);
  } catch (err) {
    const status = (err as { statusCode?: number })?.statusCode;
    // 503 = R2 not configured (local/dev) — nothing to delete remotely.
    if (status === 503) return;
    console.warn(
      `[uploads] R2 delete failed key=${key}:`,
      (err as Error)?.message || err,
    );
  }
}

/**
 * True when the upload is still referenced by a live post attachment, a
 * non-expired story, a user avatar, or a chat message. Expired stories must
 * not keep media alive. Accepts either the pool or a transactional connection
 * so callers can lock the upload row first.
 */
export async function isUploadReferenced(
  uploadId: string,
  executor: Pool | PoolConnection = getPool(),
): Promise<boolean> {
  const [postRows] = await executor.query<RowDataPacket[]>(
    `SELECT 1 FROM post_attachments WHERE upload_id = ? LIMIT 1`,
    [uploadId],
  );
  if (postRows.length) return true;

  const [storyRows] = await executor.query<RowDataPacket[]>(
    `SELECT 1 FROM stories
     WHERE upload_id = ? AND expires_at > UTC_TIMESTAMP(3)
     LIMIT 1`,
    [uploadId],
  );
  if (storyRows.length) return true;

  const [avatarRows] = await executor.query<RowDataPacket[]>(
    `SELECT 1 FROM users WHERE avatar_upload_id = ? LIMIT 1`,
    [uploadId],
  );
  if (avatarRows.length) return true;

  const [chatRows] = await executor.query<RowDataPacket[]>(
    `SELECT 1 FROM chat_messages WHERE upload_id = ? LIMIT 1`,
    [uploadId],
  );
  return chatRows.length > 0;
}

/**
 * Delete upload rows + Cloudflare R2 objects when nothing still displays them.
 * Safe to call after post/story deletes or expired-story purge.
 *
 * Locks each upload row, re-checks references, deletes the DB row first, then
 * the R2 object. The previous order (R2 then DB) left broken media if the
 * DELETE failed; the previous unlocked check let a concurrent attach lose its
 * media via FK CASCADE on post_attachments.
 */
export async function purgeOrphanedUploads(
  uploadIds: Array<string | null | undefined>,
): Promise<number> {
  const unique = [
    ...new Set(uploadIds.filter((id): id is string => Boolean(id?.trim()))),
  ];
  if (!unique.length) return 0;

  const pool = getPool();
  let purged = 0;
  for (const id of unique) {
    const conn = await pool.getConnection();
    let storageKey: string | null = null;
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query<UploadRow[]>(
        `SELECT * FROM uploads WHERE id = ? LIMIT 1 FOR UPDATE`,
        [id],
      );
      const row = rows[0];
      if (!row) {
        await conn.rollback();
        continue;
      }
      if (await isUploadReferenced(id, conn)) {
        await conn.rollback();
        continue;
      }
      storageKey = row.storage_key;
      const [result] = await conn.query<ResultSetHeader>(
        `DELETE FROM uploads WHERE id = ?`,
        [id],
      );
      if ((result.affectedRows ?? 0) === 0) {
        await conn.rollback();
        continue;
      }
      await conn.commit();
      purged += 1;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
    if (storageKey) await safeR2Delete(storageKey);
  }
  return purged;
}

/** Best-effort R2 deletes for keys already orphaned from MySQL (e.g. user CASCADE). */
export async function purgeR2StorageKeys(keys: string[]): Promise<number> {
  const unique = [...new Set(keys.filter(Boolean))];
  let n = 0;
  for (const key of unique) {
    await safeR2Delete(key);
    n += 1;
  }
  return n;
}

export { toRecord as uploadRowToRecord };
export type { UploadRow };
