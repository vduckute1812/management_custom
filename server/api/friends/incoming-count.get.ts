import { countIncomingFriendRequests } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";
import { mapDomainError } from "~/server/utils/http";

/** Lightweight badge payload — avoids hydrating full friend lists on every page. */
export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  try {
    const count = await countIncomingFriendRequests(user.sub);
    return { count };
  } catch (err) {
    mapDomainError(err);
  }
});
