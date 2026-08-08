import { requireUser } from "~/server/utils/authContext";
import { mapDomainError } from "~/server/utils/http";
import { acceptFriendshipForUser } from "~/server/services/friends/friendService";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const id = getRouterParam(event, "id");
  try {
    return await acceptFriendshipForUser(user.sub, id);
  } catch (err) {
    mapDomainError(err);
  }
});
