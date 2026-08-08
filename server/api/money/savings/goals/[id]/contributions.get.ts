import { requireUser } from "~/server/utils/authContext";
import { mapDomainError } from "~/server/utils/http";
import { listMoneySavingsContributionsForUser } from "~/server/services/money/moneySavingsService";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Missing id" });
  }
  const query = getQuery(event);
  const limitRaw = query.limit;
  const limit =
    typeof limitRaw === "string" && limitRaw.trim()
      ? Number(limitRaw)
      : undefined;
  const cursor =
    typeof query.cursor === "string" && query.cursor.trim()
      ? query.cursor.trim()
      : null;
  try {
    return await listMoneySavingsContributionsForUser(user.sub, id, {
      limit: Number.isFinite(limit) ? limit : undefined,
      cursor,
    });
  } catch (err) {
    mapDomainError(err);
  }
});
