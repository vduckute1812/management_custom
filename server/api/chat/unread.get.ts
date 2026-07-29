import { getUnreadInbox } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";
import { mapDomainError } from "~/server/utils/http";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  try {
    return await getUnreadInbox(user.sub);
  } catch (err) {
    mapDomainError(err);
  }
});
