import { requireUser } from "~/server/utils/authContext";
import { mapDomainError, parseBody } from "~/server/utils/http";
import { moneySavingsGoalUpsertBodySchema } from "~/server/schemas";
import { upsertMoneySavingsGoalForUser } from "~/server/services/money/moneySavingsService";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  try {
    const body = await parseBody(event, moneySavingsGoalUpsertBodySchema);
    return await upsertMoneySavingsGoalForUser(user.sub, body);
  } catch (err) {
    mapDomainError(err);
  }
});
