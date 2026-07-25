import { z } from "zod";
import { createPost } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";

const bodySchema = z.object({
  body: z.string().trim().max(5000).optional().default(""),
  visibility: z.enum(["public", "private", "shared"]).optional().default("public"),
  audienceUserIds: z.array(z.string().min(1)).max(50).optional().default([]),
});

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Post id required" });
  }

  const raw = await readBody(event);
  const parsed = bodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message || "Invalid share payload",
    });
  }

  try {
    const note = parsed.data.body || "Shared a post";
    const post = await createPost(user.sub, {
      body: note,
      visibility: parsed.data.visibility,
      audienceUserIds: parsed.data.audienceUserIds,
      sharedPostId: id,
    });
    return { post };
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode;
    if (statusCode === 404) {
      throw createError({
        statusCode: 404,
        statusMessage: "Original post not found",
      });
    }
    if (statusCode === 400) {
      throw createError({
        statusCode: 400,
        statusMessage: (err as Error).message,
      });
    }
    throw err;
  }
});
