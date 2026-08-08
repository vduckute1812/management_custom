/**
 * Story mutations: create, view, delete, purge expired, storage-key listing.
 */
import { DomainError } from "~/server/utils/http";
import type { RowDataPacket } from "mysql2/promise";
import { isoToDB } from "../core/datetime";
import { generateId, nowISO } from "../core/ids";
import { getPool } from "../core/pool";
import {
  assertOwnedUploads,
  purgeOrphanedUploads,
  purgeR2StorageKeys,
} from "./uploads";
import { getStoryForViewer } from "./storiesRead";
import { assertVisibleStory } from "./storiesAccess";
import { UploadKind } from "~/types/post";
import type { Story } from "~/types/story";

const STORY_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * R2 keys on stories owned by this user that may not appear in `uploads`
 * (legacy rows with `media_storage_key` and a NULL `upload_id`). Union with
 * `listStorageKeysForUser` before a user hard-delete.
 */
export async function listStoryStorageKeysForUser(
  userId: string,
): Promise<string[]> {
  const pool = getPool();
  const [rows] = await pool.query<
    (RowDataPacket & { media_storage_key: string | null })[]
  >(
    `SELECT media_storage_key
     FROM stories
     WHERE user_id = ? AND media_storage_key IS NOT NULL AND media_storage_key <> ''`,
    [userId],
  );
  return rows.map((r) => r.media_storage_key).filter((k): k is string => !!k);
}

/**
 * Remove expired stories and delete their Cloudflare media when no longer
 * referenced. Returns how many story rows were removed.
 */
export async function purgeExpiredStories(): Promise<{
  stories: number;
  uploads: number;
}> {
  const pool = getPool();
  const [expired] = await pool.query<
    (RowDataPacket & {
      id: string;
      upload_id: string | null;
      media_storage_key: string | null;
    })[]
  >(
    `SELECT id, upload_id, media_storage_key
     FROM stories
     WHERE expires_at <= UTC_TIMESTAMP(3)`,
  );
  if (!expired.length) return { stories: 0, uploads: 0 };

  const uploadIds = expired.map((r) => r.upload_id);
  const orphanKeys = expired
    .filter((r) => r.media_storage_key && !r.upload_id)
    .map((r) => r.media_storage_key as string);

  const [result] = await pool.query(
    `DELETE FROM stories WHERE expires_at <= UTC_TIMESTAMP(3)`,
  );
  const stories = (result as { affectedRows?: number }).affectedRows ?? 0;

  const uploads = await purgeOrphanedUploads(uploadIds);
  if (orphanKeys.length) {
    await purgeR2StorageKeys(orphanKeys);
  }
  return { stories, uploads };
}

export async function createStory(
  userId: string,
  args: { body?: string | null; uploadId?: string | null },
): Promise<Story> {
  const body = args.body?.trim() || null;
  const uploadId = args.uploadId?.trim() || null;
  if (!body && !uploadId) {
    throw new DomainError(400, "Story needs text or media");
  }
  if (body && body.length > 500) {
    throw new DomainError(400, "Story text must be 500 characters or fewer");
  }

  let mime: string | null = null;
  let storageKey: string | null = null;
  if (uploadId) {
    const [up] = await assertOwnedUploads(userId, [uploadId]);
    if (!up) {
      throw new DomainError(400, "Story media is invalid");
    }
    // Stories are rendered as media; a document here would surface as a
    // broken <img>, so reject it rather than store an unviewable story.
    if (up.kind !== UploadKind.Image) {
      throw new DomainError(400, "Story media must be an image");
    }
    mime = up.mime;
    storageKey = up.storage_key;
  }

  const pool = getPool();
  const id = generateId("story");
  const now = nowISO();
  const expires = new Date(Date.now() + STORY_TTL_MS).toISOString();

  await pool.query(
    `INSERT INTO stories
       (id, user_id, body, upload_id, media_storage_key, mime, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      userId,
      body,
      uploadId,
      storageKey,
      mime,
      isoToDB(now),
      isoToDB(expires),
    ],
  );

  const created = await getStoryForViewer(userId, id);
  if (!created) throw new Error("Failed to load created story");
  return created;
}

export async function markStoryViewed(
  userId: string,
  storyId: string,
): Promise<void> {
  await assertVisibleStory(userId, storyId);
  const pool = getPool();
  await pool.query(
    `INSERT INTO story_views (story_id, user_id, viewed_at)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE viewed_at = viewed_at`,
    [storyId, userId, isoToDB(nowISO())],
  );
}

export async function deleteStory(
  userId: string,
  storyId: string,
): Promise<boolean> {
  const pool = getPool();
  const [rows] = await pool.query<
    (RowDataPacket & { upload_id: string | null })[]
  >(`SELECT upload_id FROM stories WHERE id = ? AND user_id = ? LIMIT 1`, [
    storyId,
    userId,
  ]);
  if (!rows.length) return false;

  const uploadId = rows[0]?.upload_id ?? null;
  const [result] = await pool.query(
    "DELETE FROM stories WHERE id = ? AND user_id = ?",
    [storyId, userId],
  );
  const ok = ((result as { affectedRows?: number }).affectedRows ?? 0) > 0;
  if (ok && uploadId) {
    await purgeOrphanedUploads([uploadId]);
  }
  return ok;
}
