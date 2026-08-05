import { z } from "zod";
import {
  POST_FONT_FAMILIES,
  POST_FORMATS,
  POST_VISIBILITIES,
  POST_TEXT_COLORS,
  PostFormat,
  PostVisibility,
} from "~/types/post";
import { REACTION_TYPES, type ReactionType } from "~/types/reaction";
import {
  POST_BODY_MAX_MANUSCRIPT,
  POST_BODY_MAX_UPDATE,
  POST_TITLE_MAX,
} from "~/utils/postBodyLimits";
import { UPLOAD_MAX_PER_POST } from "~/utils/uploadPolicy";
import { CONTENT_LOCALES } from "~/utils/contentLocale";

export const postReactionBodySchema = z.object({
  reaction: z
    .number()
    .int()
    .refine(
      (v): v is ReactionType =>
        (REACTION_TYPES as readonly number[]).includes(v),
      { message: "Invalid reaction" },
    ),
});

const postFormatSchema = z
  .number()
  .int()
  .refine(
    (v): v is PostFormat => (POST_FORMATS as readonly number[]).includes(v),
    { message: "Invalid format" },
  );

const postVisibilitySchema = z
  .number()
  .int()
  .refine(
    (v): v is PostVisibility =>
      (POST_VISIBILITIES as readonly number[]).includes(v),
    { message: "Invalid visibility" },
  );

export const feedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  cursor: z.string().min(1).optional(),
  categoryId: z.string().min(1).optional(),
  locale: z.string().min(2).max(16).optional(),
});

/** Newest-page-first comment list; `before` is an ISO createdAt cursor. */
export const postCommentsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional().default(30),
  before: z.string().min(1).optional(),
});

export const postCommentCreateBodySchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Comment body is required")
    .max(2000, "Comment must be 2000 characters or fewer"),
});

export const postCreateBodySchema = z
  .object({
    body: z.string().trim().min(1, "Post body is required"),
    title: z.string().trim().max(POST_TITLE_MAX).optional().nullable(),
    format: postFormatSchema.optional().default(PostFormat.Update),
    visibility: postVisibilitySchema.optional().default(PostVisibility.Friends),
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
      data.format === PostFormat.Manuscript
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
    if (data.format === PostFormat.Manuscript) {
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

/** PATCH post body — format is fixed on the existing row; length checked in service. */
export const postPatchBodySchema = z.object({
  body: z.string().trim().min(1, "Post body is required"),
  title: z.string().trim().max(POST_TITLE_MAX).optional().nullable(),
  visibility: postVisibilitySchema.optional().default(PostVisibility.Friends),
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

export const postShareBodySchema = z.object({
  body: z.string().trim().max(5_000).optional().default(""),
  visibility: postVisibilitySchema.optional().default(PostVisibility.Friends),
  audienceUserIds: z.array(z.string().min(1)).max(50).optional().default([]),
});
