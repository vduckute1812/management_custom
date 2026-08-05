import { z } from "zod";
import { ARTICLE_STATUSES, type ArticleStatus } from "~/types/article";
import {
  POST_BODY_MAX_MANUSCRIPT,
  POST_TITLE_MAX,
} from "~/utils/postBodyLimits";

const articleStatusSchema = z
  .number()
  .int()
  .refine(
    (v): v is ArticleStatus =>
      (ARTICLE_STATUSES as readonly number[]).includes(v),
    { message: "Invalid article status" },
  );

export const pendingArticlesQuerySchema = z.object({
  status: z.coerce
    .number()
    .int()
    .refine(
      (v): v is ArticleStatus =>
        (ARTICLE_STATUSES as readonly number[]).includes(v),
      { message: "Invalid article status" },
    )
    .optional(),
  categoryId: z.string().min(1).optional(),
  createdFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}/, "createdFrom must be YYYY-MM-DD")
    .optional(),
  createdTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}/, "createdTo must be YYYY-MM-DD")
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export const pendingArticlePatchBodySchema = z.object({
  rewrittenTitle: z.string().trim().min(1).max(POST_TITLE_MAX).optional(),
  rewrittenContent: z
    .string()
    .trim()
    .min(1)
    .max(POST_BODY_MAX_MANUSCRIPT)
    .optional(),
  excerpt: z.string().trim().max(500).nullable().optional(),
  categoryId: z.string().min(1).nullable().optional(),
});

export const pendingArticleApproveBodySchema = z.object({
  rewrittenTitle: z.string().trim().min(1).max(POST_TITLE_MAX).optional(),
  rewrittenContent: z
    .string()
    .trim()
    .min(1)
    .max(POST_BODY_MAX_MANUSCRIPT)
    .optional(),
  categoryId: z.string().min(1).nullable().optional(),
});

export const pendingArticleRejectBodySchema = z.object({
  delete: z.boolean().optional().default(false),
});

export const pendingArticleBulkDeleteBodySchema = z.object({
  ids: z.array(z.string().trim().min(1).max(64)).min(1).max(50),
});

export const pendingArticleFetchBodySchema = z.object({
  force: z.boolean().optional().default(false),
});

export { articleStatusSchema };
