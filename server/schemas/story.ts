import { z } from "zod";

export const storyCreateBodySchema = z
  .object({
    body: z.string().trim().max(500).optional().nullable(),
    uploadId: z.string().min(1).optional().nullable(),
  })
  .refine((v) => Boolean(v.body?.trim()) || Boolean(v.uploadId), {
    message: "Story needs text or media",
  });
