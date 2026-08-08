import { requireUser } from "~/server/utils/authContext";
import { mapDomainError } from "~/server/utils/http";
import { deleteMoneyBudgetForUser } from "~/server/services/money/moneyBudgetsService";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Missing id" });
  }
  try {
    await deleteMoneyBudgetForUser(user.sub, id);
    return { ok: true };
  } catch (err) {
    mapDomainError(err);
  }
});
