import { DomainError } from "~/server/utils/http";
import type { Post, PostReactionType } from "../../types/post";
import { POST_REACTION_TYPES } from "../../types/post";
import { isoToDB } from "./datetime";
import { nowISO } from "./ids";
import { getPool } from "./pool";
import { assertPostVisible, getPostById } from "./posts";

export async function setPostReaction(
  userId: string,
  postId: string,
  reaction: PostReactionType,
): Promise<Post> {
  if (!POST_REACTION_TYPES.includes(reaction)) {
    throw new DomainError(400, "Invalid reaction");
  }
  await assertPostVisible(userId, postId);

  const pool = getPool();
  await pool.query(
    `INSERT INTO post_reactions (post_id, user_id, reaction, created_at)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE reaction = VALUES(reaction), created_at = VALUES(created_at)`,
    [postId, userId, reaction, isoToDB(nowISO())],
  );

  const refreshed = await getPostById(userId, postId);
  if (!refreshed) {
    throw new DomainError(404, "Post not found");
  }
  return refreshed;
}

export async function clearPostReaction(
  userId: string,
  postId: string,
): Promise<Post> {
  await assertPostVisible(userId, postId);

  const pool = getPool();
  await pool.query(
    "DELETE FROM post_reactions WHERE post_id = ? AND user_id = ?",
    [postId, userId],
  );

  const refreshed = await getPostById(userId, postId);
  if (!refreshed) {
    throw new DomainError(404, "Post not found");
  }
  return refreshed;
}
