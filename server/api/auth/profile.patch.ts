/**
 * PATCH /api/auth/profile
 *
 * Body (all optional): { name?, avatarUploadId?, title?, job?, location? }
 * Reply: { user: AuthUser }
 *
 * Empty string or `null` clears a field. `avatarUploadId` must reference an
 * image upload owned by the caller (from POST /api/uploads).
 */
import { z } from "zod";
import {
  purgeOrphanedUploads,
  toAuthUser,
  updateUserProfile,
} from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";

const optionalText = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (v === undefined ? undefined : v));

const bodySchema = z
  .object({
    name: optionalText,
    avatarUploadId: optionalText,
    title: optionalText,
    job: optionalText,
    location: optionalText,
  })
  .refine(
    (b) =>
      b.name !== undefined ||
      b.avatarUploadId !== undefined ||
      b.title !== undefined ||
      b.job !== undefined ||
      b.location !== undefined,
    { message: "At least one profile field is required" }
  );

export default defineEventHandler(async (event) => {
  const claims = requireUser(event);
  const parsed = bodySchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message || "Invalid body",
    });
  }

  try {
    const { user, previousAvatarUploadId } = await updateUserProfile(
      claims.sub,
      parsed.data
    );
    if (previousAvatarUploadId) {
      await purgeOrphanedUploads([previousAvatarUploadId]);
    }
    return { user: toAuthUser(user) };
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode;
    if (statusCode) {
      throw createError({
        statusCode,
        statusMessage: (err as Error).message,
      });
    }
    throw err;
  }
});
