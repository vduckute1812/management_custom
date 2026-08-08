import { requireUser } from "~/server/utils/authContext";
import { mapDomainError, parseQuery } from "~/server/utils/http";
import { friendshipsQuerySchema } from "~/server/schemas";
import { listFriendshipOverviewForUser } from "~/server/services/friends/friendService";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const query = parseQuery(event, friendshipsQuerySchema);
  try {
    return await listFriendshipOverviewForUser(user.sub, query);
  } catch (err) {
    mapDomainError(err);
  }
});
