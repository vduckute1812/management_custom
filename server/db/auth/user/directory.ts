import type { RowDataPacket } from "mysql2/promise";
import type { PostAuthor } from "~/types/post";
import { resolveDisplayName } from "~/utils/displayName";
import { avatarUrlFromUploadId } from "../../core/mappers";
import { getPool } from "../../core/pool";

export async function searchUserDirectory(
  viewerId: string,
  q: string,
  limit = 20,
): Promise<PostAuthor[]> {
  const pool = getPool();
  const term = `%${q.trim().toLowerCase()}%`;
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, name, email, avatar_upload_id FROM users
     WHERE id <> ?
       AND LOWER(COALESCE(name, '')) LIKE ?
     ORDER BY name IS NULL, name ASC, email ASC
     LIMIT ?`,
    [viewerId, term, Math.min(Math.max(limit, 1), 20)],
  );
  return rows.map((row) => ({
    id: String(row.id),
    name: resolveDisplayName(
      (row.name as string | null) ?? null,
      String(row.email),
    ),
    // Do not expose emails in directory search (enumeration risk).
    email: "",
    avatarUrl:
      avatarUrlFromUploadId((row.avatar_upload_id as string | null) ?? null) ??
      null,
  }));
}

/** Resolve directory-style author cards for a set of user ids (edit forms). */
export async function getAuthorsByIds(
  userIds: string[],
): Promise<PostAuthor[]> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (!unique.length) return [];
  const pool = getPool();
  const placeholders = unique.map(() => "?").join(",");
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id, name, email, avatar_upload_id, title, job, location
     FROM users
     WHERE id IN (${placeholders})`,
    unique,
  );
  const byId = new Map<string, PostAuthor>();
  for (const row of rows) {
    byId.set(String(row.id), {
      id: String(row.id),
      name: resolveDisplayName(
        (row.name as string | null) ?? null,
        String(row.email),
      ),
      email: "",
      avatarUrl:
        avatarUrlFromUploadId(
          (row.avatar_upload_id as string | null) ?? null,
        ) ?? null,
      title: (row.title as string | null) ?? null,
      job: (row.job as string | null) ?? null,
      location: (row.location as string | null) ?? null,
    });
  }
  return unique.flatMap((id) => {
    const author = byId.get(id);
    return author ? [author] : [];
  });
}
