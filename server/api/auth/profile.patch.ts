/**
 * PATCH /api/auth/profile
 *
 * Body (all optional): { name?, avatarUploadId?, title?, job?, location? }
 * Reply: { user: AuthUser }
 *
 * Empty string or `null` clears a field. `avatarUploadId` must reference an
 * image upload owned by the caller (from POST /api/uploads).
 */
import {
  purgeOrphanedUploads,
  toAuthUser,
  updateUserProfile,
} from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";
import { parseBody, mapDomainError } from "~/server/utils/http";
import { profilePatchBodySchema } from "~/server/schemas";

export default defineEventHandler(async (event) => {
  const claims = requireUser(event);
  try {
    const data = await parseBody(event, profilePatchBodySchema);
    const { user, previousAvatarUploadId } = await updateUserProfile(
      claims.sub,
      data,
    );
    if (previousAvatarUploadId) {
      await purgeOrphanedUploads([previousAvatarUploadId]);
    }
    return { user: toAuthUser(user) };
  } catch (err) {
    mapDomainError(err);
  }
});
