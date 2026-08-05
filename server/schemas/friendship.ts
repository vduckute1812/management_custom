import { z } from "zod";

export const friendshipRequestBodySchema = z.object({
  userId: z.string().min(1, "userId is required"),
});
