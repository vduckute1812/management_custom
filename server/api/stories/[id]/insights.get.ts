import { getStoryInsights } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";
import { DomainError, mapDomainError } from "~/server/utils/http";

export default defineEventHandler(async (event) => {
  try {
    const user = requireUser(event);
    const id = getRouterParam(event, "id");
    if (!id) {
      throw new DomainError(400, "Story id required");
    }

    const insights = await getStoryInsights(user.sub, id);
    return { insights };
  } catch (err) {
    mapDomainError(err);
  }
});
