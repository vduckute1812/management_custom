/**
 * Hydrate PostRow batches into public Post DTOs (reactions, attachments, locale).
 *
 * Loaders / mapping / locale preference live in sibling modules; this file
 * orchestrates and re-exports the public helpers.
 */
import type { Post } from "~/types/post";
import {
  loadAttachments,
  loadAudience,
  loadMyReactions,
  loadReactionMaps,
  loadTranslationMaps,
} from "./hydrationLoaders";
import { preferLocaleVariants } from "./hydrationLocale";
import { emptyReactions, rowToPost } from "./hydrationMap";
import type { PostRow } from "./types";

export { shouldFetchMoreLocaleRows } from "./hydrationLocale";

export async function hydratePosts(
  rows: PostRow[],
  viewerId: string,
  preferredLocale: string | null = null,
): Promise<Post[]> {
  const ids = rows.map((r) => r.id);
  const groupIds = rows
    .map((r) => r.translation_group_id)
    .filter((id): id is string => Boolean(id));
  const [reactions, myReactions, attachments, audience, translations] =
    await Promise.all([
      loadReactionMaps(ids),
      loadMyReactions(ids, viewerId),
      loadAttachments(ids),
      loadAudience(ids),
      loadTranslationMaps(groupIds),
    ]);
  const posts = rows.map((r) =>
    rowToPost(
      r,
      viewerId,
      reactions.get(r.id) ?? emptyReactions(),
      attachments.get(r.id) ?? [],
      audience.get(r.id) ?? [],
      myReactions.get(r.id) ?? null,
    ),
  );
  return preferLocaleVariants(posts, preferredLocale, translations);
}
