/**
 * Upload CRUD: create, fetch, read bytes, signed URL, ownership asserts.
 */
import { DomainError } from "~/server/utils/http";
import type { RowDataPacket } from "mysql2/promise";
import { isoToDB } from "../core/datetime";
import { generateId, nowISO } from "../core/ids";
import { getPool } from "../core/pool";
import type { UploadKind, UploadRecord } from "~/types/post";
import { UPLOAD_KIND_STORAGE_FOLDER, toUploadKind } from "~/types/post";
import {
  assertR2Configured,
  r2GetObjectBuffer,
  r2PutObject,
  r2SignedGetUrl,
} from "../../utils/r2";
import { toRecord, type UploadRow } from "./uploadShared";

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
