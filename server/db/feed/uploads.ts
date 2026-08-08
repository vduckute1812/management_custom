/**
 * Uploads — R2-backed media with viewer ACL.
 * Split across sibling modules; this file re-exports the public API.
 */

export type { UploadRow } from "./uploadShared";
export {
  createUpload,
  getUploadById,
  getUploadRecord,
  readUploadFile,
  signedUploadUrl,
  assertOwnedUploads,
  listStorageKeysForUser,
} from "./uploadCrud";
export {
  canViewerAccessUpload,
  resolveUploadForViewer,
  _resetUploadAccessCachesForTests,
} from "./uploadAccess";
export {
  isUploadReferenced,
  purgeOrphanedUploads,
  purgeR2StorageKeys,
} from "./uploadPurge";
