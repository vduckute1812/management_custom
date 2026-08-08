import { requireUser } from "~/server/utils/authContext";
import { parseBody, mapDomainError } from "~/server/utils/http";
import { taskUpsertBodySchema } from "~/server/schemas";
import { saveTaskForUser } from "~/server/services/time/taskService";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  try {
    const body = await parseBody(event, taskUpsertBodySchema);
    return await saveTaskForUser(user.sub, body);
  } catch (err) {
    mapDomainError(err);
  }
});
