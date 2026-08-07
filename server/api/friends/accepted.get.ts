import { listFriends } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";
import { mapDomainError, parseQuery } from "~/server/utils/http";
import { friendshipPageQuerySchema } from "~/server/schemas";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const query = parseQuery(event, friendshipPageQuerySchema);
  try {
    return await listFriends(user.sub, query);
  } catch (err) {
    mapDomainError(err);
  }
});
