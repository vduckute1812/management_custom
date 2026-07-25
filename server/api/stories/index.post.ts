import { z } from "zod";
import { createStory } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";

const bodySchema = z
  .object({
    body: z.string().trim().max(500).optional().nullable(),
    uploadId: z.string().min(1).optional().nullable(),
  })
  .refine((v) => Boolean(v.body?.trim()) || Boolean(v.uploadId), {
    message: "Story needs text or media",
  });

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const raw = await readBody(event);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: parsed.error.issues[0]?.message || "Invalid story",
    });
  }

  try {
    const story = await createStory(user.sub, {
      body: parsed.data.body,
      uploadId: parsed.data.uploadId,
    });
    return { story };
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode;
    if (statusCode === 400) {
      throw createError({
        statusCode: 400,
        statusMessage: (err as Error).message,
      });
    }
    throw err;
  }
});
