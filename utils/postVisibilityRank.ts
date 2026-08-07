import {
  PostVisibility,
  type PostVisibility as Visibility,
} from "../types/post";

/**
 * How broadly a visibility setting exposes content.
 * Higher = more people can see it. Used to prevent share wrappers from
 * widening access beyond the original post.
 */
const OPENNESS: Record<Visibility, number> = {
  [PostVisibility.Private]: 0,
  [PostVisibility.Shared]: 1,
  [PostVisibility.Friends]: 2,
  [PostVisibility.Public]: 3,
};

/** True when `requested` is no broader than `ceiling`. */
export function isVisibilityAtMostAsOpen(
  requested: Visibility,
  ceiling: Visibility,
): boolean {
  return OPENNESS[requested] <= OPENNESS[ceiling];
}

/**
 * Cap a share/create visibility so it cannot exceed the original post's
 * openness. Prefer keeping the caller's choice when it already fits.
 */
export function clampVisibilityToCeiling(
  requested: Visibility,
  ceiling: Visibility,
): Visibility {
  return isVisibilityAtMostAsOpen(requested, ceiling) ? requested : ceiling;
}
