import { DomainError } from "~/server/utils/http";
import type { RowDataPacket } from "mysql2/promise";
import { FriendshipStatus } from "../../types/friendship";
import { dbToISO, isoToDB } from "./datetime";
import { generateId, nowISO } from "./ids";
import { avatarUrlFromUploadId } from "./mappers";
import { getPool } from "./pool";
import { resolveDisplayName } from "../../utils/displayName";
import {
  assertOwnedUploads,
  purgeOrphanedUploads,
  purgeR2StorageKeys,
} from "./uploads";
import type { PostAuthor, PostReactionType } from "../../types/post";
import { POST_REACTION_TYPES, UploadKind } from "../../types/post";
import {
  emptyReactions as emptyReactionCounts,
  toReactionType,
} from "../../types/reaction";
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
  author_avatar_upload_id: string | null;
  author_title: string | null;
  author_job: string | null;
  author_location: string | null;
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
  avatar_upload_id: string | null;
  title: string | null;
  job: string | null;
  location: string | null;
  viewed_at: string;
  reaction: PostReactionType | null;
}

interface ReactionUserRow extends RowDataPacket {
  user_id: string;
  name: string | null;
  email: string;
  avatar_upload_id: string | null;
  title: string | null;
  job: string | null;
  location: string | null;
  reaction: PostReactionType;
  created_at: string;
}

function emptyReactions(): Record<PostReactionType, number> {
  return emptyReactionCounts();
}

function toAuthor(
  id: string,
  name: string | null,
  email: string,
  extras?: {
    avatarUploadId?: string | null;
    title?: string | null;
    job?: string | null;
    location?: string | null;
  },
): PostAuthor {
  return {
    id,
    name: resolveDisplayName(name, email),
    email,
    avatarUrl: avatarUrlFromUploadId(extras?.avatarUploadId) ?? null,
    title: extras?.title ?? null,
    job: extras?.job ?? null,
    location: extras?.location ?? null,
  };
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
    const reaction = toReactionType(row.reaction);
    if (reaction == null) continue;
    const bucket = map.get(row.story_id) ?? emptyReactions();
    bucket[reaction] = Number(row.cnt);
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
    (sum: number, key) => sum + (reactions[key] ?? 0),
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
    author: toAuthor(row.user_id, row.author_name, row.author_email, {
      avatarUploadId: row.author_avatar_upload_id,
      title: row.author_title,
      job: row.author_job,
      location: row.author_location,
    }),
    viewedByMe: Number(row.viewed_by_me ?? 0) > 0,
    canDelete: isOwner,
    reactions,
    reactionCount,
    myReaction: toReactionType(row.my_reaction),
    viewCount: isOwner ? Number(row.view_count ?? 0) : 0,
  };
}

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

/** Own story OR accepted friendship with author (Facebook-style). */
function storyVisibilityClause(alias = "s"): string {
  return `(
    ${alias}.user_id = ?
    OR EXISTS (
      SELECT 1 FROM friendships f
      WHERE f.status = ${FriendshipStatus.Accepted}
        AND (
          (f.requester_id = ${alias}.user_id AND f.addressee_id = ?)
          OR (f.addressee_id = ${alias}.user_id AND f.requester_id = ?)
        )
    )
  )`;
}

function storyVisibilityParams(viewerId: string): string[] {
  return [viewerId, viewerId, viewerId];
}

/** Shared SELECT for tray + single-story reload (viewer-scoped subqueries). */
const STORY_SELECT = `SELECT
       s.id, s.user_id, s.body, s.upload_id, s.media_storage_key, s.mime,
       s.created_at, s.expires_at,
       u.name AS author_name, u.email AS author_email,
       u.avatar_upload_id AS author_avatar_upload_id,
       u.title AS author_title,
       u.job AS author_job,
       u.location AS author_location,
       (SELECT COUNT(*) FROM story_views sv
         WHERE sv.story_id = s.id AND sv.user_id = ?) AS viewed_by_me,
       (SELECT sr.reaction FROM story_reactions sr
         WHERE sr.story_id = s.id AND sr.user_id = ? LIMIT 1) AS my_reaction,
       (SELECT COUNT(*) FROM story_views sv2
         WHERE sv2.story_id = s.id) AS view_count
     FROM stories s
     INNER JOIN users u ON u.id = s.user_id`;

/**
 * Load one non-expired story as the viewer would see it in the tray.
 * Prefer this over listStoriesTray after create/react mutations.
 */
export async function getStoryForViewer(
  viewerId: string,
  storyId: string,
): Promise<Story | null> {
  const pool = getPool();
  const [rows] = await pool.query<StoryRow[]>(
    `${STORY_SELECT}
     WHERE s.id = ?
       AND s.expires_at > UTC_TIMESTAMP(3)
       AND ${storyVisibilityClause("s")}
     LIMIT 1`,
    [viewerId, viewerId, storyId, ...storyVisibilityParams(viewerId)],
  );
  const row = rows[0];
  if (!row) return null;
  const reactionMaps = await loadStoryReactionMaps([row.id]);
  return rowToStory(
    row,
    viewerId,
    reactionMaps.get(row.id) ?? emptyReactions(),
  );
}

export async function listStoriesTray(viewerId: string): Promise<StoriesTray> {
  const pool = getPool();
  // Expired rows are filtered below (`expires_at > now`). Physical delete +
  // R2 cleanup runs in the job worker (~2 min), not on this read path.

  const [rows] = await pool.query<StoryRow[]>(
    `${STORY_SELECT}
     WHERE s.expires_at > UTC_TIMESTAMP(3)
       AND ${storyVisibilityClause("s")}
     ORDER BY s.created_at ASC`,
    [viewerId, viewerId, ...storyVisibilityParams(viewerId)],
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
    throw new DomainError(404, "Story not found");
  }
}

async function assertVisibleStory(
  viewerId: string,
  storyId: string,
): Promise<void> {
  const pool = getPool();
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT s.id FROM stories s
     WHERE s.id = ?
       AND s.expires_at > UTC_TIMESTAMP(3)
       AND ${storyVisibilityClause("s")}
     LIMIT 1`,
    [storyId, ...storyVisibilityParams(viewerId)],
  );
  if (!rows.length) {
    throw new DomainError(404, "Story not found");
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
       sv.user_id, u.name, u.email, u.avatar_upload_id, u.title, u.job, u.location,
       sv.viewed_at, sr.reaction
     FROM story_views sv
     INNER JOIN users u ON u.id = sv.user_id
     LEFT JOIN story_reactions sr
       ON sr.story_id = sv.story_id AND sr.user_id = sv.user_id
     WHERE sv.story_id = ?
     ORDER BY sv.viewed_at DESC`,
    [storyId],
  );

  const viewers: StoryViewerEntry[] = viewerRows.map((r) => ({
    user: toAuthor(r.user_id, r.name, r.email, {
      avatarUploadId: r.avatar_upload_id,
      title: r.title,
      job: r.job,
      location: r.location,
    }),
    viewedAt: dbToISO(r.viewed_at),
    reaction: toReactionType(r.reaction),
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
    const reaction = toReactionType(row.reaction);
    if (reaction == null) continue;
    reactions[reaction] = Number(row.cnt);
  }
  const reactionCount = POST_REACTION_TYPES.reduce(
    (sum: number, key) => sum + (reactions[key] ?? 0),
    0,
  );

  const [reactionUsers] = await pool.query<ReactionUserRow[]>(
    `SELECT sr.user_id, u.name, u.email, u.avatar_upload_id, u.title, u.job, u.location,
            sr.reaction, sr.created_at
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
    reactionUsers: reactionUsers.flatMap((r) => {
      const reaction = toReactionType(r.reaction);
      if (reaction == null) return [];
      return [
        {
          user: toAuthor(r.user_id, r.name, r.email, {
            avatarUploadId: r.avatar_upload_id,
            title: r.title,
            job: r.job,
            location: r.location,
          }),
          reaction,
          createdAt: dbToISO(r.created_at),
        },
      ];
    }),
  };
}

export async function setStoryReaction(
  userId: string,
  storyId: string,
  reaction: PostReactionType,
): Promise<Story> {
  await assertVisibleStory(userId, storyId);
  if (!POST_REACTION_TYPES.includes(reaction)) {
    throw new DomainError(400, "Invalid reaction");
  }

  const pool = getPool();
  const now = nowISO();
  await pool.query(
    `INSERT INTO story_reactions (story_id, user_id, reaction, created_at)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE reaction = VALUES(reaction), created_at = VALUES(created_at)`,
    [storyId, userId, reaction, isoToDB(now)],
  );

  const refreshed = await getStoryForViewer(userId, storyId);
  if (!refreshed) {
    throw new DomainError(404, "Story not found");
  }
  return refreshed;
}

export async function clearStoryReaction(
  userId: string,
  storyId: string,
): Promise<Story> {
  await assertVisibleStory(userId, storyId);
  const pool = getPool();
  await pool.query(
    `DELETE FROM story_reactions WHERE story_id = ? AND user_id = ?`,
    [storyId, userId],
  );

  const refreshed = await getStoryForViewer(userId, storyId);
  if (!refreshed) {
    throw new DomainError(404, "Story not found");
  }
  return refreshed;
}
