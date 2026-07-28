import {
  listConversations,
  getUnreadTotal,
} from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";
import { mapDomainError } from "~/server/utils/http";

export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  try {
    const [conversations, unreadTotal] = await Promise.all([
      listConversations(user.sub),
      getUnreadTotal(user.sub),
    ]);
    return { conversations, unreadTotal };
  } catch (err) {
    mapDomainError(err);
  }
});
