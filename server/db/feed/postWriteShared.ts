/**
 * Shared helpers for post create/update (audience + attachment inserts).
 */
import type { PoolConnection } from "mysql2/promise";
import { isoToDB } from "../core/datetime";
import { generateId } from "../core/ids";
import type { UploadRow } from "./uploads";

export async function insertAudienceRows(
  conn: PoolConnection,
  postId: string,
  userIds: string[],
  now: string,
): Promise<void> {
  if (!userIds.length) return;
  const values: unknown[] = [];
  const placeholders = userIds.map((uid) => {
    values.push(postId, uid, isoToDB(now));
    return "(?, ?, ?)";
  });
  await conn.query(
    `INSERT INTO post_audience (post_id, user_id, created_at) VALUES ${placeholders.join(",")}`,
    values,
  );
}

export async function insertAttachment(
  conn: {
    query: (sql: string, params?: unknown[]) => Promise<unknown>;
  },
  postId: string,
  up: UploadRow,
  now: string,
) {
  const attId = generateId("att");
  await conn.query(
    `INSERT INTO post_attachments
       (id, post_id, upload_id, kind, file_name, mime, size_bytes, storage_key, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      attId,
      postId,
      up.id,
      up.kind,
      up.file_name,
      up.mime,
      up.size_bytes,
      up.storage_key,
      isoToDB(now),
    ],
  );
}
