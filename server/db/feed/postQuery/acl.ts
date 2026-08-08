import { FriendshipStatus } from "~/types/friendship";
import { PostVisibility } from "~/types/post";

/**
 * ACL for authenticated viewers:
 * Public | own | Shared-with-me | Friends-with-author.
 *
 * Friends visibility uses a preloaded friend-id set (`IN (…)`) so the feed
 * query avoids a correlated `EXISTS` against `friendships` per row.
 * Shared visibility uses an uncorrelated semi-join against `post_audience`.
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

  const sharedPart = sharedAudienceClause(alias);

  return `(
    ${alias}.visibility = ${PostVisibility.Public}
    OR ${alias}.user_id = ?
    OR ${sharedPart}
    OR ${friendsPart}
  )`;
}

/**
 * Shared-with-me visibility via a semi-join. This is intentionally not a
 * row-correlated friendship check; MySQL can optimize the audience id lookup.
 */
export function sharedAudienceClause(alias = "p"): string {
  return `(
      ${alias}.visibility = ${PostVisibility.Shared}
      AND ${alias}.id IN (
        SELECT a.post_id FROM post_audience a WHERE a.user_id = ?
      )
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
