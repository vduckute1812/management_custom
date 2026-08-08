import { requireUser } from "~/server/utils/authContext";
import { mapDomainError } from "~/server/utils/http";
import { archiveMoneyUserCategoryForUser } from "~/server/services/money/moneyUserCategoriesService";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Missing id" });
  }
  try {
    await archiveMoneyUserCategoryForUser(user.sub, id);
    return { ok: true };
  } catch (err) {
    mapDomainError(err);
  }
});
