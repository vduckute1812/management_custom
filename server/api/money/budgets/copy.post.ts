import { requireUser } from "~/server/utils/authContext";
import { mapDomainError, parseBody } from "~/server/utils/http";
import { moneyBudgetsCopyBodySchema } from "~/server/schemas";
import { copyMoneyBudgetsForUser } from "~/server/services/money/moneyBudgetsService";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  try {
    const body = await parseBody(event, moneyBudgetsCopyBodySchema);
    return await copyMoneyBudgetsForUser(user.sub, body);
  } catch (err) {
    mapDomainError(err);
  }
});
