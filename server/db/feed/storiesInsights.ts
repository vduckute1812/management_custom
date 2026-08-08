/**
 * Story insights + reactions for the owner / viewer.
 */
import { DomainError } from "~/server/utils/http";
import type { RowDataPacket } from "mysql2/promise";
import { dbToISO, isoToDB } from "../core/datetime";
import { nowISO } from "../core/ids";
import { getPool } from "../core/pool";
import { STORY_INSIGHTS_LIST_MAX } from "../../utils/listLimits";
import { emptyReactions, getStoryForViewer, toAuthor } from "./storiesRead";
import { assertOwnedStory, assertVisibleStory } from "./storiesAccess";
import type { PostReactionType } from "~/types/post";
import { POST_REACTION_TYPES } from "~/types/post";
import { toReactionType } from "~/types/reaction";
import type { Story, StoryInsights, StoryViewerEntry } from "~/types/story";

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
     ORDER BY sv.viewed_at DESC
     LIMIT ?`,
    [storyId, STORY_INSIGHTS_LIST_MAX],
  );

  const viewers: StoryViewerEntry[] = viewerRows.map((r) => {
    const user = toAuthor(r.user_id, r.name, r.email, {
      avatarUploadId: r.avatar_upload_id,
      title: r.title,
      job: r.job,
      location: r.location,
    });
    user.email = "";
    return {
      user,
      viewedAt: dbToISO(r.viewed_at),
      reaction: toReactionType(r.reaction),
    };
  });

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
     ORDER BY sr.created_at DESC
     LIMIT ?`,
    [storyId, STORY_INSIGHTS_LIST_MAX],
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
      const user = toAuthor(r.user_id, r.name, r.email, {
        avatarUploadId: r.avatar_upload_id,
        title: r.title,
        job: r.job,
        location: r.location,
      });
      user.email = "";
      return [
        {
          user,
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
