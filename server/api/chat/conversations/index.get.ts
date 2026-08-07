import { listConversations, getUnreadTotal } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";
import { mapDomainError, parseQuery } from "~/server/utils/http";
import { chatConversationsQuerySchema } from "~/server/schemas";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  const query = parseQuery(event, chatConversationsQuerySchema);
  try {
    const [page, unreadTotal] = await Promise.all([
      listConversations(user.sub, {
        limit: query.limit,
        cursor: query.cursor,
      }),
      getUnreadTotal(user.sub),
    ]);
    return { ...page, unreadTotal };
  } catch (err) {
    mapDomainError(err);
  }
});
