/**
 * Stable user database API. Implementations are grouped by responsibility
 * under `server/db/auth/user/` to keep callers decoupled from the internal layout.
 */
export type { CreateUserInput } from "./user/account";
export {
  createUser,
  createUserWithEmailVerification,
  deleteUserRecord,
  markUserEmailVerified,
  recordUserLogin,
  updateUserRole,
} from "./user/account";
export { getAuthorsByIds, searchUserDirectory } from "./user/directory";
export type {
  UpdateUserPreferencesInput,
  UpdateUserProfileInput,
} from "./user/profile";
export { updateUserPreferences, updateUserProfile } from "./user/profile";
export {
  countUsers,
  getUserByEmail,
  getUserById,
  listUsers,
} from "./user/queries";
