import { listFriendshipOverview } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";
import { mapDomainError } from "~/server/utils/http";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  try {
    return await listFriendshipOverview(user.sub);
  } catch (err) {
    mapDomainError(err);
  }
});
