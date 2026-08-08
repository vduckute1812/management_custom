import { requireUser } from "~/server/utils/authContext";
import { parseBody, mapDomainError } from "~/server/utils/http";
import { epicUpsertBodySchema } from "~/server/schemas";
import { upsertEpicForUser } from "~/server/services/time/epicService";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  try {
    const body = await parseBody(event, epicUpsertBodySchema);
    return await upsertEpicForUser(user.sub, body);
  } catch (err) {
    mapDomainError(err);
  }
});
