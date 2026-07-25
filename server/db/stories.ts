import type { RowDataPacket } from "mysql2/promise";
import { dbToISO, isoToDB } from "./datetime";
import { generateId, nowISO } from "./ids";
import { getPool } from "./pool";
import { assertOwnedUploads } from "./uploads";
import type { PostAuthor } from "../../types/post";
import type { Story, StoryAuthorGroup, StoriesTray } from "../../types/story";

const STORY_TTL_MS = 24 * 60 * 60 * 1000;

interface StoryRow extends RowDataPacket {
  id: string;
  user_id: string;
  body: string | null;
  upload_id: string | null;
  media_storage_key: string | null;
  mime: string | null;
  created_at: string;
  expires_at: string;
  author_name: string | null;
  author_email: string;
  viewed_by_me: number;
}

function toAuthor(
  id: string,
  name: string | null,
  email: string
): PostAuthor {
  return { id, name, email };
}

function rowToStory(row: StoryRow, viewerId: string): Story {
  return {
    id: row.id,
    body: row.body,
    mime: row.mime,
    mediaUrl: row.upload_id ? `/api/uploads/${row.upload_id}` : null,
    createdAt: dbToISO(row.created_at),
    expiresAt: dbToISO(row.expires_at),
    author: toAuthor(row.user_id, row.author_name, row.author_email),
    viewedByMe: Number(row.viewed_by_me ?? 0) > 0,
    canDelete: row.user_id === viewerId,
  };
}

export async function listStoriesTray(viewerId: string): Promise<StoriesTray> {
  const pool = getPool();
  // Lazy cleanup of expired stories (best-effort).
  await pool.query(`DELETE FROM stories WHERE expires_at <= UTC_TIMESTAMP(3)`);

  const [rows] = await pool.query<StoryRow[]>(
    `SELECT
       s.id, s.user_id, s.body, s.upload_id, s.media_storage_key, s.mime,
       s.created_at, s.expires_at,
       u.name AS author_name, u.email AS author_email,
       (SELECT COUNT(*) FROM story_views sv
         WHERE sv.story_id = s.id AND sv.user_id = ?) AS viewed_by_me
     FROM stories s
     INNER JOIN users u ON u.id = s.user_id
     WHERE s.expires_at > UTC_TIMESTAMP(3)
     ORDER BY s.created_at ASC`,
    [viewerId]
  );

  const byAuthor = new Map<string, StoryAuthorGroup>();
  for (const row of rows) {
    const story = rowToStory(row, viewerId);
    let group = byAuthor.get(story.author.id);
    if (!group) {
      group = {
        author: story.author,
        stories: [],
        hasUnseen: false,
      };
      byAuthor.set(story.author.id, group);
    }
    group.stories.push(story);
    if (!story.viewedByMe) group.hasUnseen = true;
  }

  // Author's own stories first, then unseen, then alphabetical.
  const groups = [...byAuthor.values()].sort((a, b) => {
    if (a.author.id === viewerId) return -1;
    if (b.author.id === viewerId) return 1;
    if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1;
    const an = (a.author.name || a.author.email).toLowerCase();
    const bn = (b.author.name || b.author.email).toLowerCase();
    return an.localeCompare(bn);
  });

  return { groups };
}

export async function createStory(
  userId: string,
  args: { body?: string | null; uploadId?: string | null }
): Promise<Story> {
  const body = args.body?.trim() || null;
  const uploadId = args.uploadId?.trim() || null;
  if (!body && !uploadId) {
    throw Object.assign(new Error("Story needs text or media"), {
      statusCode: 400,
    });
  }
  if (body && body.length > 500) {
    throw Object.assign(new Error("Story text must be 500 characters or fewer"), {
      statusCode: 400,
    });
  }

  let mime: string | null = null;
  let storageKey: string | null = null;
  if (uploadId) {
    const [up] = await assertOwnedUploads(userId, [uploadId]);
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
    ]
  );

  const tray = await listStoriesTray(userId);
  for (const g of tray.groups) {
    const found = g.stories.find((s) => s.id === id);
    if (found) return found;
  }
  throw new Error("Failed to load created story");
}

export async function markStoryViewed(
  userId: string,
  storyId: string
): Promise<void> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id FROM stories
     WHERE id = ? AND expires_at > UTC_TIMESTAMP(3)
     LIMIT 1`,
    [storyId]
  );
  if (!rows.length) {
    throw Object.assign(new Error("Story not found"), { statusCode: 404 });
  }
  await pool.query(
    `INSERT INTO story_views (story_id, user_id, viewed_at)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE viewed_at = viewed_at`,
    [storyId, userId, isoToDB(nowISO())]
  );
}

export async function deleteStory(
  userId: string,
  storyId: string
): Promise<boolean> {
  const pool = getPool();
  const [result] = await pool.query(
    "DELETE FROM stories WHERE id = ? AND user_id = ?",
    [storyId, userId]
  );
  return ((result as { affectedRows?: number }).affectedRows ?? 0) > 0;
}
