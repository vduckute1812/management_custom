/**
 * Locale-aware feed hydration: pagination lower-bound + pick preferred translation.
 */
import type { Post, PostTranslationRef } from "~/types/post";
import { CONTENT_LOCALES } from "~/utils/contentLocale";
import type { PostRow } from "./types";

function localeRank(locale: string, preferred: string | null): number {
  if (preferred && locale === preferred) return 0;
  if (locale === "en") return 1;
  if (locale === "vi") return 2;
  const idx = (CONTENT_LOCALES as readonly string[]).indexOf(locale);
  return idx >= 0 ? 10 + idx : 100;
}

/**
 * Translation groups produce at least one hydrated card each. Treating every
 * non-null group as one candidate is a safe lower bound: malformed singleton
 * groups may make us over-fetch, but can never make us stop too early.
 */
export function shouldFetchMoreLocaleRows(
  rows: readonly Pick<PostRow, "id" | "translation_group_id">[],
  targetCount: number,
  lastBatchFull: boolean,
): boolean {
  if (!lastBatchFull) return false;
  const candidates = new Set(
    rows.map((row) =>
      row.translation_group_id
        ? `group:${row.translation_group_id}`
        : `post:${row.id}`,
    ),
  );
  return candidates.size < targetCount;
}

export function preferLocaleVariants(
  posts: Post[],
  preferredLocale: string | null,
  translationMap: Map<string, PostTranslationRef[]>,
): Post[] {
  const bestByGroup = new Map<string, Post>();

  for (const post of posts) {
    const groupId = post.translationGroupId;
    const siblings = groupId ? (translationMap.get(groupId) ?? []) : [];
    const withTranslations: Post = {
      ...post,
      translations: siblings,
    };

    if (!groupId || siblings.length <= 1) {
      bestByGroup.set(`solo:${post.id}`, withTranslations);
      continue;
    }

    const prev = bestByGroup.get(groupId);
    if (
      !prev ||
      localeRank(withTranslations.contentLocale, preferredLocale) <
        localeRank(prev.contentLocale, preferredLocale)
    ) {
      bestByGroup.set(groupId, withTranslations);
    }
  }

  const emitted = new Set<string>();
  const out: Post[] = [];
  for (const post of posts) {
    const key =
      post.translationGroupId &&
      (translationMap.get(post.translationGroupId)?.length ?? 0) > 1
        ? post.translationGroupId
        : `solo:${post.id}`;
    if (emitted.has(key)) continue;
    const chosen = bestByGroup.get(key);
    if (!chosen) continue;
    emitted.add(key);
    out.push(chosen);
  }
  return out;
}
