import { requireUser } from "~/server/utils/authContext";
import { mapDomainError } from "~/server/utils/http";
import { stopTimerForUser } from "~/server/services/timerService";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  try {
    return await stopTimerForUser(user.sub);
  } catch (err) {
    mapDomainError(err);
  }
});
