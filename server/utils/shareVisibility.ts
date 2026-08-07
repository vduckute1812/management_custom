import { DomainError } from "~/server/utils/http";
import {
  PostVisibility,
  type PostVisibility as Visibility,
} from "../../types/post";
import { clampVisibilityToCeiling } from "../../utils/postVisibilityRank";

/**
 * Constrain a share-wrapper's visibility/audience so it cannot widen access
 * beyond the original post. Used on create and update.
 */
export function constrainShareWrapperAccess(args: {
  originalVisibility: Visibility;
  originalAudienceIds: readonly string[];
  originalAuthorId: string;
  sharerUserId: string;
  requestedVisibility: Visibility;
  requestedAudienceIds: readonly string[];
}): { visibility: Visibility; audienceUserIds: string[] } {
  if (args.originalVisibility === PostVisibility.Private) {
    throw new DomainError(400, "Private posts cannot be shared");
  }

  let visibility = clampVisibilityToCeiling(
    args.requestedVisibility,
    args.originalVisibility,
  );

  // Friends-only originals must not become Shared-to-arbitrary audiences.
  if (
    args.originalVisibility === PostVisibility.Friends &&
    visibility === PostVisibility.Shared
  ) {
    visibility = PostVisibility.Friends;
  }

  if (visibility !== PostVisibility.Shared) {
    return { visibility, audienceUserIds: [] };
  }

  const allowed = new Set(args.originalAudienceIds);
  allowed.add(args.originalAuthorId);
  const audienceUserIds = [
    ...new Set(
      args.requestedAudienceIds.filter(
        (id) => id && id !== args.sharerUserId && allowed.has(id),
      ),
    ),
  ];

  if (
    args.originalVisibility === PostVisibility.Shared &&
    audienceUserIds.length === 0
  ) {
    throw new DomainError(
      400,
      "Share audience must be a subset of the original audience",
    );
  }

  return { visibility, audienceUserIds };
}
