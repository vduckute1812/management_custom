import { requireUser } from "~/server/utils/authContext";
import { mapDomainError } from "~/server/utils/http";
import { listMoneySavingsContributionsForUser } from "~/server/services/moneySavingsService";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Missing id" });
  }
  try {
    return await listMoneySavingsContributionsForUser(user.sub, id);
  } catch (err) {
    mapDomainError(err);
  }
});
