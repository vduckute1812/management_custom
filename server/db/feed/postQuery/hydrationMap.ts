/**
 * Map a hydrated PostRow (+ side-loaded maps) into the public Post DTO.
 */
import { dbToISO } from "../../core/datetime";
import { avatarUrlFromUploadId } from "../../core/mappers";
import { resolveDisplayName } from "~/utils/displayName";
import type {
  Post,
  PostAttachment,
  PostAuthor,
  PostCategory,
  PostReactionType,
  SharedPostPreview,
} from "~/types/post";
import {
  POST_REACTION_TYPES,
  toPostFormat,
  toPostVisibility,
} from "~/types/post";
import { emptyReactions as emptyReactionCounts } from "~/types/reaction";
import {
  normalizeContentLocale,
  normalizeFontFamily,
  normalizeTextColor,
  normalizeTitle,
} from "./normalizers";
import type { PostRow } from "./types";

export function emptyReactions(): Record<PostReactionType, number> {
  return emptyReactionCounts();
}

function toAuthor(
  id: string,
  name: string | null,
  email: string,
  extras?: {
    avatarUploadId?: string | null;
    title?: string | null;
    job?: string | null;
    location?: string | null;
  },
): PostAuthor {
  return {
    id,
    name: resolveDisplayName(name, email),
    email,
    avatarUrl: avatarUrlFromUploadId(extras?.avatarUploadId) ?? null,
    title: extras?.title ?? null,
    job: extras?.job ?? null,
    location: extras?.location ?? null,
  };
}

function categoryFromRow(row: PostRow): PostCategory | null {
  if (!row.category_id || !row.category_slug || !row.category_name) return null;
  return {
    id: row.category_id,
    slug: row.category_slug,
    name: row.category_name,
    sortOrder: Number(row.category_sort_order ?? 0),
  };
}

export function rowToPost(
  row: PostRow,
  viewerId: string,
  reactions: Record<PostReactionType, number>,
  attachments: PostAttachment[],
  audienceUserIds: string[],
  myReaction: PostReactionType | null,
): Post {
  let sharedPost: SharedPostPreview | null = null;
  if (
    row.shared_post_id &&
    row.shared_body != null &&
    row.shared_author_id &&
    row.shared_author_email
  ) {
    sharedPost = {
      id: row.shared_post_id,
      title: normalizeTitle(row.shared_title),
      body: row.shared_body,
      format: toPostFormat(row.shared_format),
      createdAt: dbToISO(row.shared_created_at),
      author: toAuthor(
        row.shared_author_id,
        row.shared_author_name,
        row.shared_author_email,
        {
          avatarUploadId: row.shared_author_avatar_upload_id,
          title: row.shared_author_title,
          job: row.shared_author_job,
          location: row.shared_author_location,
        },
      ),
    };
  }

  const reactionCount = POST_REACTION_TYPES.reduce(
    (sum: number, key) => sum + (reactions[key] ?? 0),
    0,
  );

  const author = toAuthor(row.user_id, row.author_name, row.author_email, {
    avatarUploadId: row.author_avatar_upload_id,
    title: row.author_title,
    job: row.author_job,
    location: row.author_location,
  });
  // Only the post owner sees their own email on the wire.
  if (!viewerId || row.user_id !== viewerId) {
    author.email = "";
  }

  if (sharedPost && (!viewerId || row.shared_author_id !== viewerId)) {
    sharedPost.author.email = "";
  }

  return {
    id: row.id,
    format: toPostFormat(row.format),
    title: normalizeTitle(row.title),
    body: row.body,
    visibility: toPostVisibility(row.visibility),
    category: categoryFromRow(row),
    fontFamily: normalizeFontFamily(row.font_family),
    textColor: normalizeTextColor(row.text_color),
    contentLocale: normalizeContentLocale(row.content_locale),
    translationGroupId: row.translation_group_id ?? null,
    translations: [],
    createdAt: dbToISO(row.created_at),
    updatedAt: dbToISO(row.updated_at),
    author,
    reactions,
    reactionCount,
    myReaction,
    commentCount: Number(row.comment_count ?? 0),
    attachments,
    audienceUserIds,
    sharedPost,
    canEdit: !!viewerId && row.user_id === viewerId,
    canDelete: !!viewerId && row.user_id === viewerId,
  };
}
