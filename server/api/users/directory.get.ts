import { z } from "zod";
import { searchUserDirectory } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";

const querySchema = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(20).optional().default(20),
});

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const parsed = querySchema.safeParse(getQuery(event));
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: "Query q is required",
    });
  }
  const users = await searchUserDirectory(
    user.sub,
    parsed.data.q,
    parsed.data.limit
  );
  return { users };
});
