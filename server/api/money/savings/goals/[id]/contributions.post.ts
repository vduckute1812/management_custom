import { requireUser } from "~/server/utils/authContext";
import { mapDomainError, parseBody } from "~/server/utils/http";
import { moneySavingsContributionCreateBodySchema } from "~/server/schemas";
import { addMoneySavingsContributionForUser } from "~/server/services/moneySavingsService";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Missing id" });
  }
  try {
    const body = await parseBody(
      event,
      moneySavingsContributionCreateBodySchema,
    );
    return await addMoneySavingsContributionForUser(user.sub, id, body);
  } catch (err) {
    mapDomainError(err);
  }
});
