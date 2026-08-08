import { requireUser } from "~/server/utils/authContext";
import { mapDomainError, parseQuery } from "~/server/utils/http";
import { friendshipPageQuerySchema } from "~/server/schemas";
import { listOutgoingFriendRequestsForUser } from "~/server/services/friends/friendService";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const query = parseQuery(event, friendshipPageQuerySchema);
  try {
    return await listOutgoingFriendRequestsForUser(user.sub, query);
  } catch (err) {
    mapDomainError(err);
  }
});
