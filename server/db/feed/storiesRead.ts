import type { RowDataPacket } from "mysql2/promise";
import { dbToISO } from "../core/datetime";
import { listAcceptedFriendIds } from "../friends/friendships";
import { avatarUrlFromUploadId } from "../core/mappers";
import { getPool } from "../core/pool";
import { resolveDisplayName } from "~/utils/displayName";
import type { PostAuthor, PostReactionType } from "~/types/post";
import { POST_REACTION_TYPES } from "~/types/post";
import {
  emptyReactions as emptyReactionCounts,
  toReactionType,
} from "~/types/reaction";
import type { Story, StoryAuthorGroup, StoriesTray } from "~/types/story";
import { STORIES_TRAY_MAX } from "../../utils/listLimits";

export interface StoryRow extends RowDataPacket {
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
}

interface ReactionCountRow extends RowDataPacket {
  story_id: string;
  reaction: PostReactionType;
  cnt: number;
}

export function emptyReactions(): Record<PostReactionType, number> {
  return emptyReactionCounts();
}

export function toAuthor(
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

export async function loadStoryViewerState(
  storyIds: string[],
  viewerId: string,
): Promise<{
  viewed: Map<string, boolean>;
  myReaction: Map<string, PostReactionType | null>;
  viewCount: Map<string, number>;
}> {
  const viewed = new Map<string, boolean>();
  const myReaction = new Map<string, PostReactionType | null>();
  const viewCount = new Map<string, number>();
  for (const id of storyIds) {
    viewed.set(id, false);
    myReaction.set(id, null);
    viewCount.set(id, 0);
  }
  if (!storyIds.length) {
    return { viewed, myReaction, viewCount };
  }

  const pool = getPool();
  const placeholders = storyIds.map(() => "?").join(",");

  const [viewRows, reactionRows, countRows] = await Promise.all([
    pool.query<(RowDataPacket & { story_id: string })[]>(
      `SELECT story_id FROM story_views
       WHERE user_id = ? AND story_id IN (${placeholders})`,
      [viewerId, ...storyIds],
    ),
    viewerId
      ? pool.query<(RowDataPacket & { story_id: string; reaction: number })[]>(
          `SELECT story_id, reaction FROM story_reactions
           WHERE user_id = ? AND story_id IN (${placeholders})`,
          [viewerId, ...storyIds],
        )
      : Promise.resolve([[]] as unknown as [
          (RowDataPacket & { story_id: string; reaction: number })[],
        ]),
    pool.query<(RowDataPacket & { story_id: string; cnt: number })[]>(
      `SELECT story_id, COUNT(*) AS cnt FROM story_views
       WHERE story_id IN (${placeholders})
       GROUP BY story_id`,
      storyIds,
    ),
  ]);

  for (const row of viewRows[0]) viewed.set(row.story_id, true);
  for (const row of reactionRows[0]) {
    myReaction.set(row.story_id, toReactionType(row.reaction));
  }
  for (const row of countRows[0]) {
    viewCount.set(row.story_id, Number(row.cnt ?? 0));
  }
  return { viewed, myReaction, viewCount };
}

export function rowToStory(
  row: StoryRow,
  viewerId: string,
  reactions: Record<PostReactionType, number>,
  viewerState: {
    viewedByMe: boolean;
    myReaction: PostReactionType | null;
    viewCount: number;
  },
): Story {
  const reactionCount = POST_REACTION_TYPES.reduce(
    (sum: number, key) => sum + (reactions[key] ?? 0),
    0,
  );
  const isOwner = row.user_id === viewerId;
  const author = toAuthor(row.user_id, row.author_name, row.author_email, {
    avatarUploadId: row.author_avatar_upload_id,
    title: row.author_title,
    job: row.author_job,
    location: row.author_location,
  });
  // Only the story owner sees their own email on the wire.
  author.email = isOwner ? row.author_email : "";
  return {
    id: row.id,
    body: row.body,
    mime: row.mime,
    mediaUrl: row.upload_id ? `/api/uploads/${row.upload_id}` : null,
    createdAt: dbToISO(row.created_at),
    expiresAt: dbToISO(row.expires_at),
    author,
    viewedByMe: viewerState.viewedByMe,
    canDelete: isOwner,
    reactions,
    reactionCount,
    myReaction: viewerState.myReaction,
    viewCount: isOwner ? viewerState.viewCount : 0,
  };
}

/** Own story OR accepted friendship with author (friend ids preloaded). */
export function storyVisibilityClause(
  alias = "s",
  friendIds: readonly string[] = [],
): string {
  const friendsPart =
    friendIds.length === 0
      ? "0"
      : `${alias}.user_id IN (${friendIds.map(() => "?").join(",")})`;
  return `(
    ${alias}.user_id = ?
    OR ${friendsPart}
  )`;
}

export function storyVisibilityParams(
  viewerId: string,
  friendIds: readonly string[] = [],
): string[] {
  return [viewerId, ...friendIds];
}

/** Shared SELECT for tray + single-story reload (viewer state loaded in batch). */
export const STORY_SELECT = `SELECT
       s.id, s.user_id, s.body, s.upload_id, s.media_storage_key, s.mime,
       s.created_at, s.expires_at,
       u.name AS author_name, u.email AS author_email,
       u.avatar_upload_id AS author_avatar_upload_id,
       u.title AS author_title,
       u.job AS author_job,
       u.location AS author_location
     FROM stories s
     INNER JOIN users u ON u.id = s.user_id`;

function viewerStateFor(
  storyId: string,
  state: Awaited<ReturnType<typeof loadStoryViewerState>>,
) {
  return {
    viewedByMe: state.viewed.get(storyId) ?? false,
    myReaction: state.myReaction.get(storyId) ?? null,
    viewCount: state.viewCount.get(storyId) ?? 0,
  };
}

/**
 * Load one non-expired story as the viewer would see it in the tray.
 * Prefer this over listStoriesTray after create/react mutations.
 */
export async function getStoryForViewer(
  viewerId: string,
  storyId: string,
): Promise<Story | null> {
  const pool = getPool();
  const friendIds = await listAcceptedFriendIds(viewerId);
  const [rows] = await pool.query<StoryRow[]>(
    `${STORY_SELECT}
     WHERE s.id = ?
       AND s.expires_at > UTC_TIMESTAMP(3)
       AND ${storyVisibilityClause("s", friendIds)}
     LIMIT 1`,
    [storyId, ...storyVisibilityParams(viewerId, friendIds)],
  );
  const row = rows[0];
  if (!row) return null;
  const [reactionMaps, viewerState] = await Promise.all([
    loadStoryReactionMaps([row.id]),
    loadStoryViewerState([row.id], viewerId),
  ]);
  return rowToStory(
    row,
    viewerId,
    reactionMaps.get(row.id) ?? emptyReactions(),
    viewerStateFor(row.id, viewerState),
  );
}

export async function listStoriesTray(viewerId: string): Promise<StoriesTray> {
  const pool = getPool();
  // Expired rows are filtered below (`expires_at > now`). Physical delete +
  // R2 cleanup runs in the job worker (~2 min), not on this read path.
  // Cap newest-first so a busy friend graph cannot return an unbounded tray.

  const friendIds = await listAcceptedFriendIds(viewerId);
  const [newestFirst] = await pool.query<StoryRow[]>(
    `${STORY_SELECT}
     WHERE s.expires_at > UTC_TIMESTAMP(3)
       AND ${storyVisibilityClause("s", friendIds)}
     ORDER BY s.created_at DESC
     LIMIT ?`,
    [...storyVisibilityParams(viewerId, friendIds), STORIES_TRAY_MAX],
  );
  // Grouping expects chronological order within each author.
  const rows = newestFirst.slice().reverse();

  const storyIds = rows.map((r) => r.id);
  const [reactionMaps, viewerState] = await Promise.all([
    loadStoryReactionMaps(storyIds),
    loadStoryViewerState(storyIds, viewerId),
  ]);

  const byAuthor = new Map<string, StoryAuthorGroup>();
  for (const row of rows) {
    const story = rowToStory(
      row,
      viewerId,
      reactionMaps.get(row.id) ?? emptyReactions(),
      viewerStateFor(row.id, viewerState),
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
