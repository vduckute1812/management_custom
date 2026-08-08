import { deletePost } from "~/server/utils/db";
import { requireUser } from "~/server/utils/authContext";
import { DomainError, mapDomainError } from "~/server/utils/http";
import {
  invalidateAllAuthFeedCaches,
  invalidatePublicFeedCaches,
} from "~/server/utils/cacheInvalidate";

export default defineEventHandler(async (event) => {
  try {
    const user = requireUser(event);
    const id = getRouterParam(event, "id");
    if (!id) {
      throw new DomainError(400, "Post id required");
    }

    const ok = await deletePost(user.sub, id);
    if (!ok) {
      throw new DomainError(404, "Post not found");
    }
    // Visibility unknown after delete — drop anonymous + auth slices eagerly.
    await invalidatePublicFeedCaches();
    await invalidateAllAuthFeedCaches();
    return { ok: true };
  } catch (err) {
    mapDomainError(err);
  }
});
