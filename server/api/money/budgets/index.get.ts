import { requireUser } from "~/server/utils/authContext";
import { parseQuery } from "~/server/utils/http";
import { moneyBudgetsQuerySchema } from "~/server/schemas";
import { listMoneyBudgetsForUser } from "~/server/services/moneyBudgetsService";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const query = parseQuery(event, moneyBudgetsQuerySchema);
  return listMoneyBudgetsForUser(user.sub, query);
});
