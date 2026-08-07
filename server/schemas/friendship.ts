import { z } from "zod";

export const friendshipRequestBodySchema = z.object({
  userId: z.string().min(1, "userId is required"),
});

export const friendshipsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  friendsCursor: z.string().trim().min(1).max(512).optional(),
  incomingCursor: z.string().trim().min(1).max(512).optional(),
  outgoingCursor: z.string().trim().min(1).max(512).optional(),
});

export const friendshipPageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  cursor: z.string().trim().min(1).max(512).optional(),
});
