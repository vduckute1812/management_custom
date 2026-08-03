import { requireUser } from "~/server/utils/authContext";
import { mapDomainError } from "~/server/utils/http";
import { listMoneyUserCategoriesForUser } from "~/server/services/moneyUserCategoriesService";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  try {
    return await listMoneyUserCategoriesForUser(user.sub);
  } catch (err) {
    mapDomainError(err);
  }
});
