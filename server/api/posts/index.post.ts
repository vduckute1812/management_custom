import { z } from "zod";
import { createPost } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";
import {
  POST_FONT_FAMILIES,
  POST_FORMATS,
  POST_TEXT_COLORS,
} from "~/types/post";
import {
  POST_BODY_MAX_MANUSCRIPT,
  POST_BODY_MAX_UPDATE,
  POST_TITLE_MAX,
} from "~/utils/postBodyLimits";
import { UPLOAD_MAX_PER_POST } from "~/utils/uploadPolicy";
import { invalidatePublicFeedCaches } from "~/server/utils/cacheInvalidate";
import { CONTENT_LOCALES } from "~/utils/contentLocale";

const bodySchema = z
  .object({
    body: z.string().trim().min(1, "Post body is required"),
    title: z.string().trim().max(POST_TITLE_MAX).optional().nullable(),
    format: z
      .enum(POST_FORMATS as unknown as [string, ...string[]])
      .optional()
      .default("update"),
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
    contentLocale: z
      .enum(CONTENT_LOCALES as unknown as [string, ...string[]])
      .optional()
      .nullable(),
    translationGroupId: z.string().min(1).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    const max =
      data.format === "manuscript"
        ? POST_BODY_MAX_MANUSCRIPT
        : POST_BODY_MAX_UPDATE;
    if (data.body.length > max) {
      ctx.addIssue({
        code: z.ZodIssueCode.too_big,
        maximum: max,
        type: "string",
        inclusive: true,
        path: ["body"],
        message: `Post body must be at most ${max} characters`,
      });
    }
    if (data.format === "manuscript") {
      const title = (data.title ?? "").trim();
      if (!title) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["title"],
          message: "Manuscript title is required",
        });
      }
    }
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
      title: parsed.data.title ?? null,
      format: parsed.data.format as (typeof POST_FORMATS)[number],
      visibility: parsed.data.visibility,
      audienceUserIds: parsed.data.audienceUserIds,
      attachmentIds: parsed.data.attachmentIds,
      categoryId: parsed.data.categoryId ?? null,
      fontFamily: parsed.data.fontFamily as (typeof POST_FONT_FAMILIES)[number],
      textColor: parsed.data.textColor as (typeof POST_TEXT_COLORS)[number],
      contentLocale: parsed.data.contentLocale ?? null,
      translationGroupId: parsed.data.translationGroupId ?? null,
    });
    if (post.visibility === "public") {
      await invalidatePublicFeedCaches();
    }
    return { post };
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode;
    const message = (err as Error)?.message;
    if (
      statusCode === 400 ||
      statusCode === 403 ||
      statusCode === 404 ||
      statusCode === 409
    ) {
      throw createError({ statusCode, statusMessage: message });
    }
    throw err;
  }
});
