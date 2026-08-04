import { PostVisibility } from "../../../types/post";

/** ACL for authenticated viewers (public + own + shared-with-me). */
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
  )`;
}

/** Anonymous visitors may only see explicitly public posts. */
export function publicOnlyClause(alias = "p"): string {
  return `${alias}.visibility = ${PostVisibility.Public}`;
}
