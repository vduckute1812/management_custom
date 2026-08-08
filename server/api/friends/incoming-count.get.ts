import { requireUser } from "~/server/utils/authContext";
import { mapDomainError } from "~/server/utils/http";
import { countIncomingFriendRequestsForUser } from "~/server/services/friends/friendService";

/** Lightweight badge payload — avoids hydrating full friend lists on every page. */
export default defineEventHandler(async (event) => {
  const user = requireUser(event);
  try {
    return await countIncomingFriendRequestsForUser(user.sub);
  } catch (err) {
    mapDomainError(err);
  }
});
