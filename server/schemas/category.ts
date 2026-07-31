import { z } from "zod";

export const categoryCreateBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(64).optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
});

export const categoryPatchBodySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
});
