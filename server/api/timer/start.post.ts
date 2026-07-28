import { requireUser } from "~/server/utils/authContext";
import { parseBody, mapDomainError } from "~/server/utils/http";
import { timerStartBodySchema } from "~/server/schemas";
import { startTimerForUser } from "~/server/services/timerService";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  try {
    const body = await parseBody(event, timerStartBodySchema);
    return await startTimerForUser(user.sub, body.taskId);
  } catch (err) {
    mapDomainError(err);
  }
});
