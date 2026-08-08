/**
 * Story ACL helpers shared by write + insights paths.
 */
import { DomainError } from "~/server/utils/http";
import type { RowDataPacket } from "mysql2/promise";
import { listAcceptedFriendIds } from "../friends/friendships";
import { getPool } from "../core/pool";
import { storyVisibilityClause, storyVisibilityParams } from "./storiesRead";

export async function assertOwnedStory(
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

export async function assertVisibleStory(
  viewerId: string,
  storyId: string,
): Promise<void> {
  const pool = getPool();
  const friendIds = await listAcceptedFriendIds(viewerId);
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT s.id FROM stories s
     WHERE s.id = ?
       AND s.expires_at > UTC_TIMESTAMP(3)
       AND ${storyVisibilityClause("s", friendIds)}
     LIMIT 1`,
    [storyId, ...storyVisibilityParams(viewerId, friendIds)],
  );
  if (!rows.length) {
    throw new DomainError(404, "Story not found");
  }
}
