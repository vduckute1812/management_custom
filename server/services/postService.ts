import { createPost } from "~/server/utils/db";
import { invalidatePublicFeedCaches } from "~/server/utils/cacheInvalidate";
import { DomainError } from "~/server/utils/http";
import type {
  PostFontFamily,
  PostFormat,
  PostTextColor,
  PostVisibility,
} from "~/types/post";

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
    if (post.visibility === "public") {
      await invalidatePublicFeedCaches();
    }
    return { post };
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode;
    const message = (err as Error)?.message ?? "Failed to create post";
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
}
