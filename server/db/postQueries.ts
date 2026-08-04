/**
 * Read-side helpers for the posts feed.
 *
 * Sub-modules under `./postQuery/` hold focused query/hydration logic.
 * Mutations (createPost, updatePost, deletePost) live in `../posts.ts`.
 */
export type { PostRow } from "./postQuery/types";
export {
  normalizeFontFamily,
  normalizeTitle,
  normalizeContentLocale,
  normalizeTextColor,
} from "./postQuery/normalizers";
export { visibilityClause, publicOnlyClause } from "./postQuery/acl";
export { encodeFeedCursor, parseFeedCursor } from "./postQuery/cursors";
export { POST_SELECT } from "./postQuery/select";
export { hydratePosts } from "./postQuery/hydration";
export {
  assertPostVisible,
  listFeedPosts,
  getPostById,
} from "./postQuery/queries";
