import type { RowDataPacket } from "mysql2/promise";
import { dbToISO, isoToDB } from "./datetime";
import { generateId, nowISO } from "./ids";
import { getPool } from "./pool";
import { assertOwnedUploads } from "./uploads";
import type { PostAuthor, PostReactionType } from "../../types/post";
import { POST_REACTION_TYPES } from "../../types/post";
import type {
  Story,
  StoryAuthorGroup,
  StoryInsights,
  StoriesTray,
  StoryViewerEntry,
} from "../../types/story";

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
  my_reaction: PostReactionType | null;
  view_count: number;
}

interface ReactionCountRow extends RowDataPacket {
  story_id: string;
  reaction: PostReactionType;
  cnt: number;
}

interface ViewerRow extends RowDataPacket {
  user_id: string;
  name: string | null;
  email: string;
  viewed_at: string;
  reaction: PostReactionType | null;
}

interface ReactionUserRow extends RowDataPacket {
  user_id: string;
  name: string | null;
  email: string;
  reaction: PostReactionType;
  created_at: string;
}

function emptyReactions(): Record<PostReactionType, number> {
  return {
    like: 0,
    love: 0,
    haha: 0,
    wow: 0,
    sad: 0,
    angry: 0,
  };
}

function toAuthor(id: string, name: string | null, email: string): PostAuthor {
  return { id, name, email };
}

async function loadStoryReactionMaps(
  storyIds: string[],
): Promise<Map<string, Record<PostReactionType, number>>> {
  const map = new Map<string, Record<PostReactionType, number>>();
  for (const id of storyIds) map.set(id, emptyReactions());
  if (!storyIds.length) return map;

  const pool = getPool();
  const placeholders = storyIds.map(() => "?").join(",");
  const [rows] = await pool.query<ReactionCountRow[]>(
    `SELECT story_id, reaction, COUNT(*) AS cnt
     FROM story_reactions
     WHERE story_id IN (${placeholders})
     GROUP BY story_id, reaction`,
    storyIds,
  );
  for (const row of rows) {
    const bucket = map.get(row.story_id) ?? emptyReactions();
    bucket[row.reaction] = Number(row.cnt);
    map.set(row.story_id, bucket);
  }
  return map;
}

function rowToStory(
  row: StoryRow,
  viewerId: string,
  reactions: Record<PostReactionType, number>,
): Story {
  const reactionCount = POST_REACTION_TYPES.reduce(
    (sum, key) => sum + (reactions[key] ?? 0),
    0,
  );
  const isOwner = row.user_id === viewerId;
  return {
    id: row.id,
    body: row.body,
    mime: row.mime,
    mediaUrl: row.upload_id ? `/api/uploads/${row.upload_id}` : null,
    createdAt: dbToISO(row.created_at),
    expiresAt: dbToISO(row.expires_at),
    author: toAuthor(row.user_id, row.author_name, row.author_email),
    viewedByMe: Number(row.viewed_by_me ?? 0) > 0,
    canDelete: isOwner,
    reactions,
    reactionCount,
    myReaction: row.my_reaction ?? null,
    viewCount: isOwner ? Number(row.view_count ?? 0) : 0,
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
         WHERE sv.story_id = s.id AND sv.user_id = ?) AS viewed_by_me,
       (SELECT sr.reaction FROM story_reactions sr
         WHERE sr.story_id = s.id AND sr.user_id = ? LIMIT 1) AS my_reaction,
       (SELECT COUNT(*) FROM story_views sv2
         WHERE sv2.story_id = s.id) AS view_count
     FROM stories s
     INNER JOIN users u ON u.id = s.user_id
     WHERE s.expires_at > UTC_TIMESTAMP(3)
     ORDER BY s.created_at ASC`,
    [viewerId, viewerId],
  );

  const reactionMaps = await loadStoryReactionMaps(rows.map((r) => r.id));

  const byAuthor = new Map<string, StoryAuthorGroup>();
  for (const row of rows) {
    const story = rowToStory(
      row,
      viewerId,
      reactionMaps.get(row.id) ?? emptyReactions(),
    );
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
  args: { body?: string | null; uploadId?: string | null },
): Promise<Story> {
  const body = args.body?.trim() || null;
  const uploadId = args.uploadId?.trim() || null;
  if (!body && !uploadId) {
    throw Object.assign(new Error("Story needs text or media"), {
      statusCode: 400,
    });
  }
  if (body && body.length > 500) {
    throw Object.assign(
      new Error("Story text must be 500 characters or fewer"),
      {
        statusCode: 400,
      },
    );
  }

  let mime: string | null = null;
  let storageKey: string | null = null;
  if (uploadId) {
    const [up] = await assertOwnedUploads(userId, [uploadId]);
    // Stories are rendered as media; a document here would surface as a
    // broken <img>, so reject it rather than store an unviewable story.
    if (up.kind !== "image") {
      throw Object.assign(new Error("Story media must be an image"), {
        statusCode: 400,
      });
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

  const tray = await listStoriesTray(userId);
  for (const g of tray.groups) {
    const found = g.stories.find((s) => s.id === id);
    if (found) return found;
  }
  throw new Error("Failed to load created story");
}

export async function markStoryViewed(
  userId: string,
  storyId: string,
): Promise<void> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id FROM stories
     WHERE id = ? AND expires_at > UTC_TIMESTAMP(3)
     LIMIT 1`,
    [storyId],
  );
  if (!rows.length) {
    throw Object.assign(new Error("Story not found"), { statusCode: 404 });
  }
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
  const [result] = await pool.query(
    "DELETE FROM stories WHERE id = ? AND user_id = ?",
    [storyId, userId],
  );
  return ((result as { affectedRows?: number }).affectedRows ?? 0) > 0;
}

async function assertOwnedStory(
  userId: string,
  storyId: string,
): Promise<void> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id FROM stories
     WHERE id = ? AND user_id = ? AND expires_at > UTC_TIMESTAMP(3)
     LIMIT 1`,
    [storyId, userId],
  );
  if (!rows.length) {
    throw Object.assign(new Error("Story not found"), { statusCode: 404 });
  }
}

async function assertVisibleStory(storyId: string): Promise<void> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT id FROM stories
     WHERE id = ? AND expires_at > UTC_TIMESTAMP(3)
     LIMIT 1`,
    [storyId],
  );
  if (!rows.length) {
    throw Object.assign(new Error("Story not found"), { statusCode: 404 });
  }
}

export async function getStoryInsights(
  ownerId: string,
  storyId: string,
): Promise<StoryInsights> {
  await assertOwnedStory(ownerId, storyId);
  const pool = getPool();

  const [viewerRows] = await pool.query<ViewerRow[]>(
    `SELECT
       sv.user_id, u.name, u.email, sv.viewed_at,
       sr.reaction
     FROM story_views sv
     INNER JOIN users u ON u.id = sv.user_id
     LEFT JOIN story_reactions sr
       ON sr.story_id = sv.story_id AND sr.user_id = sv.user_id
     WHERE sv.story_id = ?
     ORDER BY sv.viewed_at DESC`,
    [storyId],
  );

  const viewers: StoryViewerEntry[] = viewerRows.map((r) => ({
    user: toAuthor(r.user_id, r.name, r.email),
    viewedAt: dbToISO(r.viewed_at),
    reaction: r.reaction ?? null,
  }));

  const [reactionRows] = await pool.query<ReactionCountRow[]>(
    `SELECT story_id, reaction, COUNT(*) AS cnt
     FROM story_reactions
     WHERE story_id = ?
     GROUP BY story_id, reaction`,
    [storyId],
  );
  const reactions = emptyReactions();
  for (const row of reactionRows) {
    reactions[row.reaction] = Number(row.cnt);
  }
  const reactionCount = POST_REACTION_TYPES.reduce(
    (sum, key) => sum + (reactions[key] ?? 0),
    0,
  );

  const [reactionUsers] = await pool.query<ReactionUserRow[]>(
    `SELECT sr.user_id, u.name, u.email, sr.reaction, sr.created_at
     FROM story_reactions sr
     INNER JOIN users u ON u.id = sr.user_id
     WHERE sr.story_id = ?
     ORDER BY sr.created_at DESC`,
    [storyId],
  );

  return {
    storyId,
    viewCount: viewers.length,
    viewers,
    reactions,
    reactionCount,
    reactionUsers: reactionUsers.map((r) => ({
      user: toAuthor(r.user_id, r.name, r.email),
      reaction: r.reaction,
      createdAt: dbToISO(r.created_at),
    })),
  };
}

export async function setStoryReaction(
  userId: string,
  storyId: string,
  reaction: PostReactionType,
): Promise<Story> {
  await assertVisibleStory(storyId);
  if (!POST_REACTION_TYPES.includes(reaction)) {
    throw Object.assign(new Error("Invalid reaction"), { statusCode: 400 });
  }

  const pool = getPool();
  const now = nowISO();
  await pool.query(
    `INSERT INTO story_reactions (story_id, user_id, reaction, created_at)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE reaction = VALUES(reaction), created_at = VALUES(created_at)`,
    [storyId, userId, reaction, isoToDB(now)],
  );

  const tray = await listStoriesTray(userId);
  for (const g of tray.groups) {
    const found = g.stories.find((s) => s.id === storyId);
    if (found) return found;
  }
  throw Object.assign(new Error("Story not found"), { statusCode: 404 });
}

export async function clearStoryReaction(
  userId: string,
  storyId: string,
): Promise<Story> {
  await assertVisibleStory(storyId);
  const pool = getPool();
  await pool.query(
    `DELETE FROM story_reactions WHERE story_id = ? AND user_id = ?`,
    [storyId, userId],
  );

  const tray = await listStoriesTray(userId);
  for (const g of tray.groups) {
    const found = g.stories.find((s) => s.id === storyId);
    if (found) return found;
  }
  throw Object.assign(new Error("Story not found"), { statusCode: 404 });
}
