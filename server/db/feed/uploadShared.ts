/**
 * Upload row shape and API record mapper.
 */
import type { RowDataPacket } from "mysql2/promise";
import type { UploadKind, UploadRecord } from "~/types/post";
import { toUploadKind } from "~/types/post";

export interface UploadRow extends RowDataPacket {
  id: string;
  user_id: string;
  file_name: string;
  mime: string;
  kind: UploadKind;
  size_bytes: number;
  storage_key: string;
  created_at: string;
}

export function toRecord(row: UploadRow): UploadRecord {
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
