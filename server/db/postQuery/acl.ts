import { FriendshipStatus } from "../../../types/friendship";
import { PostVisibility } from "../../../types/post";

/**
 * ACL for authenticated viewers:
 * Public | own | Shared-with-me | Friends-with-author.
 *
 * Bind params (4× viewerId): own, audience, friends-as-addressee,
 * friends-as-requester — use `visibilityClauseParams(viewerId)`.
 */
export function visibilityClause(alias = "p"): string {
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
    OR (
      ${alias}.visibility = ${PostVisibility.Friends}
      AND EXISTS (
        SELECT 1 FROM friendships f
        WHERE f.status = ${FriendshipStatus.Accepted}
          AND (
            (f.requester_id = ${alias}.user_id AND f.addressee_id = ?)
            OR (f.addressee_id = ${alias}.user_id AND f.requester_id = ?)
          )
      )
    )
  )`;
}

/** Placeholders for {@link visibilityClause} — always 4 copies of viewerId. */
export function visibilityClauseParams(viewerId: string): string[] {
  return [viewerId, viewerId, viewerId, viewerId];
}

/** Anonymous visitors may only see explicitly public posts. */
export function publicOnlyClause(alias = "p"): string {
  return `${alias}.visibility = ${PostVisibility.Public}`;
}
