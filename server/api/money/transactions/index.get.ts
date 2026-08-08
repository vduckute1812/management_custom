import { requireUser } from "~/server/utils/authContext";
import { parseQuery } from "~/server/utils/http";
import { moneyTransactionsQuerySchema } from "~/server/schemas";
import { listMoneyTransactionsForUser } from "~/server/services/money/moneyService";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const query = parseQuery(event, moneyTransactionsQuerySchema);
  return listMoneyTransactionsForUser(user.sub, query);
});
