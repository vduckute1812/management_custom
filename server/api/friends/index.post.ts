import { requireUser } from "~/server/utils/authContext";
import { parseBody, mapDomainError } from "~/server/utils/http";
import { friendshipRequestBodySchema } from "~/server/schemas";
import { requestFriendshipForUser } from "~/server/services/friends/friendService";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const body = await parseBody(event, friendshipRequestBodySchema);
  try {
    return await requestFriendshipForUser(user.sub, body);
  } catch (err) {
    mapDomainError(err);
  }
});
