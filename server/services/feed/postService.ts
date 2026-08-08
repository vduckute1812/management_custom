import { createPost, getPostById, updatePost } from "~/server/utils/db";
import { invalidateFeedCachesAfterPostMutation } from "~/server/utils/cacheInvalidate";
import { DomainError } from "~/server/utils/http";
import type { PostFontFamily, PostTextColor } from "~/types/post";
import { PostFormat, PostVisibility } from "~/types/post";
import {
  POST_BODY_MAX_MANUSCRIPT,
  POST_BODY_MAX_UPDATE,
} from "~/utils/postBodyLimits";

function wrapPostMutationError(err: unknown, fallback: string): never {
  const statusCode = (err as { statusCode?: number })?.statusCode;
  const message = (err as Error)?.message ?? fallback;
  if (
    statusCode === 400 ||
    statusCode === 403 ||
    statusCode === 404 ||
    statusCode === 409
  ) {
    throw new DomainError(statusCode, message);
  }
  throw err;
}

export async function createPostForUser(
  userId: string,
  input: {
    body: string;
    title?: string | null;
    format?: PostFormat;
    visibility?: PostVisibility;
    audienceUserIds?: string[];
    attachmentIds?: string[];
    categoryId?: string | null;
    fontFamily?: PostFontFamily | null;
    textColor?: PostTextColor | null;
    contentLocale?: string | null;
    translationGroupId?: string | null;
  },
) {
  try {
    const post = await createPost(userId, input);
    await invalidateFeedCachesAfterPostMutation({
      actorId: userId,
      visibility: post.visibility,
      audienceUserIds: post.audienceUserIds,
    });
    return { post };
  } catch (err: unknown) {
    wrapPostMutationError(err, "Failed to create post");
  }
}

export async function updatePostForUser(
  userId: string,
  postId: string,
  input: {
    body: string;
    title?: string | null;
    visibility?: PostVisibility;
    audienceUserIds?: string[];
    attachmentIds?: string[];
    categoryId?: string | null;
    fontFamily?: PostFontFamily | null;
    textColor?: PostTextColor | null;
  },
) {
  const existing = await getPostById(userId, postId);
  if (!existing || !existing.canEdit) {
    throw new DomainError(404, "Post not found");
  }

  const max =
    existing.format === PostFormat.Manuscript
      ? POST_BODY_MAX_MANUSCRIPT
      : POST_BODY_MAX_UPDATE;
  if (input.body.length > max) {
    throw new DomainError(400, `Post body must be at most ${max} characters`);
  }
  if (existing.format === PostFormat.Manuscript) {
    const title = (input.title ?? "").trim();
    if (!title) {
      throw new DomainError(400, "Manuscript title is required");
    }
  }

  try {
    const { post, previousVisibility } = await updatePost(userId, postId, {
      body: input.body,
      title: input.title ?? null,
      visibility: input.visibility,
      audienceUserIds: input.audienceUserIds,
      attachmentIds: input.attachmentIds,
      categoryId: input.categoryId ?? null,
      fontFamily: input.fontFamily,
      textColor: input.textColor,
    });
    await invalidateFeedCachesAfterPostMutation({
      actorId: userId,
      previousVisibility,
      visibility: post.visibility,
      previousAudienceUserIds: existing.audienceUserIds,
      audienceUserIds: post.audienceUserIds,
    });
    return { post };
  } catch (err: unknown) {
    wrapPostMutationError(err, "Failed to update post");
  }
}

export async function sharePostForUser(
  userId: string,
  sharedPostId: string,
  input: {
    body?: string;
    visibility?: PostVisibility;
    audienceUserIds?: string[];
  },
) {
  try {
    const note = input.body?.trim() || "Shared a post";
    const post = await createPost(userId, {
      body: note,
      visibility: input.visibility,
      audienceUserIds: input.audienceUserIds,
      sharedPostId,
    });
    await invalidateFeedCachesAfterPostMutation({
      actorId: userId,
      visibility: post.visibility,
      audienceUserIds: post.audienceUserIds,
    });
    return { post };
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode;
    if (statusCode === 404) {
      throw new DomainError(404, "Original post not found");
    }
    wrapPostMutationError(err, "Failed to share post");
  }
}
