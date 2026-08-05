import { FriendshipStatus } from "../../../types/friendship";
import { PostVisibility } from "../../../types/post";

/**
 * ACL for authenticated viewers:
 * Public | own | Shared-with-me | Friends-with-author.
 *
 * Friends visibility uses a preloaded friend-id set (`IN (…)`) so the feed
 * query avoids a correlated `EXISTS` against `friendships` per row.
 * Shared visibility still uses a correlated audience `EXISTS` (sparse).
 *
 * Bind order: own viewerId, audience viewerId, then friend ids (0…N).
 */
export function visibilityClause(
  alias = "p",
  friendIds: readonly string[] = [],
): string {
  const friendsPart =
    friendIds.length === 0
      ? "0"
      : `(
      ${alias}.visibility = ${PostVisibility.Friends}
      AND ${alias}.user_id IN (${friendIds.map(() => "?").join(",")})
    )`;

  return `(
    ${alias}.visibility = ${PostVisibility.Public}
    OR ${alias}.user_id = ?
    OR (
      ${alias}.visibility = ${PostVisibility.Shared}
      AND EXISTS (
        SELECT 1 FROM post_audience a
        WHERE a.post_id = ${alias}.id AND a.user_id = ?
      )
    )
    OR ${friendsPart}
  )`;
}

/** Params for {@link visibilityClause}: own + audience + friend ids. */
export function visibilityClauseParams(
  viewerId: string,
  friendIds: readonly string[] = [],
): string[] {
  return [viewerId, viewerId, ...friendIds];
}

/** Anonymous visitors may only see explicitly public posts. */
export function publicOnlyClause(alias = "p"): string {
  return `${alias}.visibility = ${PostVisibility.Public}`;
}

/** Kept for docs/tests — Accepted friendship status used by friend-id loader. */
export const ACL_FRIENDSHIP_STATUS = FriendshipStatus.Accepted;
