import { requireUser } from "~/server/utils/authContext";
import { mapDomainError, parseBody } from "~/server/utils/http";
import { moneyBudgetUpsertBodySchema } from "~/server/schemas";
import { upsertMoneyBudgetForUser } from "~/server/services/money/moneyBudgetsService";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  try {
    const body = await parseBody(event, moneyBudgetUpsertBodySchema);
    return await upsertMoneyBudgetForUser(user.sub, body);
  } catch (err) {
    mapDomainError(err);
  }
});
