import { z } from "zod";
import { updatePostCategory } from "~/server/utils/db";
import { requireAdmin } from "~/server/utils/authContext";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
});

export default defineEventHandler(async (event) => {
  requireAdmin(event);
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: "Category id required",
    });
  }
  const parsed = bodySchema.safeParse(await readBody(event));
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: "Invalid body" });
  }

  try {
    const category = await updatePostCategory(id, parsed.data);
    return { category };
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode;
    if (statusCode) {
      throw createError({
        statusCode,
        statusMessage: (err as Error).message,
      });
    }
    throw err;
  }
});
