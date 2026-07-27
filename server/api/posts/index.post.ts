import { z } from "zod";
import { createPost } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";
import { POST_FONT_FAMILIES, POST_TEXT_COLORS } from "~/types/post";
import { POST_BODY_MAX } from "~/utils/postBodyLimits";
import { UPLOAD_MAX_PER_POST } from "~/utils/uploadPolicy";

const bodySchema = z.object({
  body: z.string().trim().min(1, "Post body is required").max(POST_BODY_MAX),
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
  const raw = await readBody(event);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message || "Invalid post payload",
    });
  }

  try {
    const post = await createPost(user.sub, {
      body: parsed.data.body,
      visibility: parsed.data.visibility,
      audienceUserIds: parsed.data.audienceUserIds,
      attachmentIds: parsed.data.attachmentIds,
      categoryId: parsed.data.categoryId ?? null,
      fontFamily: parsed.data.fontFamily as (typeof POST_FONT_FAMILIES)[number],
      textColor: parsed.data.textColor as (typeof POST_TEXT_COLORS)[number],
    });
    return { post };
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode;
    const message = (err as Error)?.message;
    if (statusCode === 400) {
      throw createError({ statusCode: 400, statusMessage: message });
    }
    throw err;
  }
});
