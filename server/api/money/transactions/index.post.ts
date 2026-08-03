import { requireUser } from "~/server/utils/authContext";
import { mapDomainError, parseBody } from "~/server/utils/http";
import { moneyTransactionUpsertBodySchema } from "~/server/schemas";
import { upsertMoneyTransactionForUser } from "~/server/services/moneyService";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  try {
    const body = await parseBody(event, moneyTransactionUpsertBodySchema);
    return await upsertMoneyTransactionForUser(user.sub, body);
  } catch (err) {
    mapDomainError(err);
  }
});
