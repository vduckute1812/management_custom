import { requireUser } from "~/server/utils/authContext";
import { mapDomainError, parseBody } from "~/server/utils/http";
import { moneyUserCategoryUpsertBodySchema } from "~/server/schemas";
import { upsertMoneyUserCategoryForUser } from "~/server/services/moneyUserCategoriesService";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  try {
    const body = await parseBody(event, moneyUserCategoryUpsertBodySchema);
    return await upsertMoneyUserCategoryForUser(user.sub, body);
  } catch (err) {
    mapDomainError(err);
  }
});
