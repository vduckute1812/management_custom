import { z } from "zod";
import { createPost } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";

const bodySchema = z.object({
  body: z.string().trim().min(1, "Post body is required").max(5000),
  visibility: z.enum(["public", "private", "shared"]).optional().default("public"),
  audienceUserIds: z.array(z.string().min(1)).max(50).optional().default([]),
  attachmentIds: z.array(z.string().min(1)).max(10).optional().default([]),
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
