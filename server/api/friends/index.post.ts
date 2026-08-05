import { requestFriendship } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";
import { parseBody, mapDomainError } from "~/server/utils/http";
import { friendshipRequestBodySchema } from "~/server/schemas";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const body = await parseBody(event, friendshipRequestBodySchema);
  try {
    const friendship = await requestFriendship(user.sub, body.userId);
    return { friendship };
  } catch (err) {
    mapDomainError(err);
  }
});
