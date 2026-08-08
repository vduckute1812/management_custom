/**
 * Delete feed posts (owner-scoped or admin by id).
 */
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "../core/pool";
import { purgeOrphanedUploads } from "./uploads";

export async function deletePost(
  userId: string,
  postId: string,
): Promise<boolean> {
  const pool = getPool();
  const [attRows] = await pool.query<(RowDataPacket & { upload_id: string })[]>(
    `SELECT pa.upload_id
     FROM post_attachments pa
     INNER JOIN posts p ON p.id = pa.post_id
     WHERE pa.post_id = ? AND p.user_id = ?`,
    [postId, userId],
  );

  const [result] = await pool.query(
    "DELETE FROM posts WHERE id = ? AND user_id = ?",
    [postId, userId],
  );
  const ok = ((result as { affectedRows?: number }).affectedRows ?? 0) > 0;
  if (ok && attRows.length) {
    await purgeOrphanedUploads(attRows.map((r) => r.upload_id));
  }
  return ok;
}

/** Admin hard-delete: remove a post by id regardless of author. */
export async function deletePostById(postId: string): Promise<boolean> {
  const pool = getPool();
  const [attRows] = await pool.query<(RowDataPacket & { upload_id: string })[]>(
    `SELECT upload_id FROM post_attachments WHERE post_id = ?`,
    [postId],
  );

  const [result] = await pool.query("DELETE FROM posts WHERE id = ?", [postId]);
  const ok = ((result as { affectedRows?: number }).affectedRows ?? 0) > 0;
  if (ok && attRows.length) {
    await purgeOrphanedUploads(attRows.map((r) => r.upload_id));
  }
  return ok;
}
