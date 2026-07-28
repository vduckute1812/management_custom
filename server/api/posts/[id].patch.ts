import { z } from "zod";
import { getPostById, updatePost } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";
import { POST_FONT_FAMILIES, POST_TEXT_COLORS } from "~/types/post";
import {
  POST_BODY_MAX_MANUSCRIPT,
  POST_BODY_MAX_UPDATE,
  POST_TITLE_MAX,
} from "~/utils/postBodyLimits";
import { UPLOAD_MAX_PER_POST } from "~/utils/uploadPolicy";
import { invalidatePublicFeedCaches } from "~/server/utils/cacheInvalidate";

const bodySchema = z.object({
  body: z.string().trim().min(1, "Post body is required"),
  title: z.string().trim().max(POST_TITLE_MAX).optional().nullable(),
  visibility: z
    .enum(["public", "private", "shared"])
    .optional()
    .default("public"),
  audienceUserIds: z.array(z.string().min(1)).max(50).optional().default([]),
  attachmentIds: z
    .array(z.string().min(1))
    .max(UPLOAD_MAX_PER_POST)
    .optional()
    .default([]),
  categoryId: z.string().min(1).nullable().optional(),
  fontFamily: z
    .enum(POST_FONT_FAMILIES as unknown as [string, ...string[]])
    .optional()
    .default("default"),
  textColor: z
    .enum(POST_TEXT_COLORS as unknown as [string, ...string[]])
    .optional()
    .default("default"),
});

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Post id required" });
  }

  const existing = await getPostById(user.sub, id);
  if (!existing || !existing.canEdit) {
    throw createError({ statusCode: 404, statusMessage: "Post not found" });
  }

  const raw = await readBody(event);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message || "Invalid post payload",
    });
  }

  const max =
    existing.format === "manuscript"
      ? POST_BODY_MAX_MANUSCRIPT
      : POST_BODY_MAX_UPDATE;
  if (parsed.data.body.length > max) {
    throw createError({
      statusCode: 400,
      statusMessage: `Post body must be at most ${max} characters`,
    });
  }
  if (existing.format === "manuscript") {
    const title = (parsed.data.title ?? "").trim();
    if (!title) {
      throw createError({
        statusCode: 400,
        statusMessage: "Manuscript title is required",
      });
    }
  }

  try {
    const { post, previousVisibility } = await updatePost(user.sub, id, {
      body: parsed.data.body,
      title: parsed.data.title ?? null,
      visibility: parsed.data.visibility,
      audienceUserIds: parsed.data.audienceUserIds,
      attachmentIds: parsed.data.attachmentIds,
      categoryId: parsed.data.categoryId ?? null,
      fontFamily: parsed.data.fontFamily as (typeof POST_FONT_FAMILIES)[number],
      textColor: parsed.data.textColor as (typeof POST_TEXT_COLORS)[number],
    });
    if (previousVisibility === "public" || post.visibility === "public") {
      await invalidatePublicFeedCaches();
    }
    return { post };
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode;
    const message = (err as Error)?.message;
    if (statusCode === 400 || statusCode === 404) {
      throw createError({ statusCode, statusMessage: message });
    }
    throw err;
  }
});
