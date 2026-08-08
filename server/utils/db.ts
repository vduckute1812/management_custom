/**
 * Public surface of the server-side DB layer.
 *
 * Domain SQL lives under feature folders in `server/db/{feature}/`.
 * This barrel keeps callers stable (`~/server/utils/db`).
 *
 * Features: core, auth, time, feed, chat, money, friends, admin.
 */

export * from "../db/core/types";
export * from "../db/core/pool";
export * from "../db/core/ids";
export * from "../db/core/compute";
export { avatarUrlFromUploadId, toAuthUser } from "../db/core/mappers";
export * from "../db/time/epics";
export * from "../db/time/tasks";
export * from "../db/time/timer";
export * from "../db/auth/users";
export * from "../db/auth/auth-identities";
export * from "../db/auth/refresh-tokens";
export * from "../db/auth/email-verifications";
export * from "../db/auth/password-resets";
export * from "../db/admin/admin";
export {
  encodeFeedCursor,
  parseFeedCursor,
  assertPostVisible,
  listFeedPosts,
  getPostById,
} from "../db/feed/postQueries";
export {
  createPost,
  updatePost,
  deletePost,
  deletePostById,
} from "../db/feed/posts";
export * from "../db/feed/postReactions";
export * from "../db/feed/postComments";
export * from "../db/feed/categories";
export * from "../db/feed/uploads";
export * from "../db/feed/stories";
export * from "../db/core/jobs";
export * from "../db/admin/pendingArticles";
export * from "../db/chat/chat";
export * from "../db/money/money";
export * from "../db/money/moneySavings";
export * from "../db/money/moneyBudgets";
export * from "../db/friends/friendships";
// CLI-only migrator symbols stay direct imports from `~/server/db/core/migrator`.
export { migrationStatus, verifyMigrationsApplied } from "../db/core/migrator";
