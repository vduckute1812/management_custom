/**
 * Public surface of the server-side DB layer.
 *
 * Domain SQL lives under feature folders in `server/db/{feature}/`.
 * This barrel keeps callers stable (`~/server/utils/db`) with **explicit**
 * named exports — no `export *` (avoids leaking test helpers / internals).
 *
 * Features: core, auth, time, feed, chat, money, friends, admin.
 * Domains that import their own folders directly (jobs, pendingArticles,
 * moneySavings, moneyBudgets, …) are intentionally omitted here.
 */

/* --- core --------------------------------------------------------------- */
export {
  RECURRENCE_RULES,
  USER_ROLES,
  UserRole,
  isAdminRole,
  type TimeBlock,
  type UserRecord,
} from "../db/core/types";
export { closePool, getPool } from "../db/core/pool";
export { generateId, nowISO } from "../db/core/ids";
export { toEpicView, toTaskView } from "../db/core/compute";
export { toAuthUser } from "../db/core/mappers";
// CLI-only migrator symbols stay available for scripts / integration helpers.
export { migrationStatus, verifyMigrationsApplied } from "../db/core/migrator";

/* --- time --------------------------------------------------------------- */
export {
  deleteEpic,
  getAllEpics,
  getEpicById,
  upsertEpic,
} from "../db/time/epics";
export {
  appendBlock,
  deleteTask,
  getAllTasks,
  getTaskById,
  upsertTask,
} from "../db/time/tasks";
export { getActiveTimer, setActiveTimer } from "../db/time/timer";

/* --- auth --------------------------------------------------------------- */
export {
  countUsers,
  createUser,
  createUserWithEmailVerification,
  getAuthorsByIds,
  getUserByEmail,
  getUserById,
  listUsers,
  recordUserLogin,
  searchUserDirectory,
  updateUserPreferences,
  updateUserProfile,
  updateUserRole,
} from "../db/auth/users";
export {
  getIdentityByProviderSubject,
  linkIdentity,
  listIdentitiesForUser,
  unlinkIdentity,
  userHasProvider,
} from "../db/auth/auth-identities";
export {
  findActiveRefreshToken,
  findRefreshTokenByHash,
  issueRefreshToken,
  revokeAllRefreshTokensForUser,
  revokeRefreshToken,
  revokeRefreshTokenFamily,
  rotateRefreshToken,
} from "../db/auth/refresh-tokens";
export { redeemEmailVerification } from "../db/auth/email-verifications";
export {
  createPasswordReset,
  invalidatePendingPasswordResets,
  passwordResetIsRedeemable,
  redeemPasswordReset,
} from "../db/auth/password-resets";

/* --- admin -------------------------------------------------------------- */
export {
  getAdminUserSummaries,
  getDailyHoursAllUsers,
  getStatusBreakdownAllUsers,
} from "../db/admin/admin";

/* --- feed --------------------------------------------------------------- */
export { listFeedPosts, getPostById } from "../db/feed/postQueries";
export { createPost, updatePost, deletePost } from "../db/feed/posts";
export { clearPostReaction, setPostReaction } from "../db/feed/postReactions";
export {
  createPostComment,
  deletePostComment,
  listPostComments,
} from "../db/feed/postComments";
export {
  createPostCategory,
  deletePostCategory,
  listPostCategories,
  updatePostCategory,
} from "../db/feed/categories";
export {
  createUpload,
  purgeOrphanedUploads,
  readUploadFile,
  resolveUploadForViewer,
  signedUploadUrl,
} from "../db/feed/uploads";
export {
  clearStoryReaction,
  createStory,
  deleteStory,
  getStoryInsights,
  listStoriesTray,
  markStoryViewed,
  setStoryReaction,
} from "../db/feed/stories";

/* --- chat --------------------------------------------------------------- */
export {
  clearChatMessageReaction,
  getOrCreateDirectConversation,
  getPeerUserId,
  getUnreadInbox,
  getUnreadTotal,
  listConversations,
  listMessages,
  markConversationRead,
  sendMessage,
  setChatMessageReaction,
  type SendMessageInput,
} from "../db/chat/chat";

/* --- money (seed / scripts via barrel; app routes use feature folders) -- */
export { upsertMoneyTransaction } from "../db/money/money";

/* --- friends ------------------------------------------------------------ */
export {
  acceptFriendship,
  areFriends,
  countIncomingFriendRequests,
  deleteFriendship,
  listFriends,
  listFriendshipOverview,
  listIncomingFriendRequests,
  listOutgoingFriendRequests,
  requestFriendship,
} from "../db/friends/friendships";
