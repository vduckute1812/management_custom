/**
 * Upload purge / orphan cleanup and R2 key deletion.
 */
import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";
import { getPool } from "../core/pool";
import { r2DeleteObject } from "../../utils/r2";
import type { UploadRow } from "./uploadShared";

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
    let storageKey: string | null;
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
