/**
 * Shared domain types for the social Feed tab.
 */

export type PostVisibility = "public" | "private" | "shared";

export type PostReactionType =
  | "like"
  | "love"
  | "haha"
  | "wow"
  | "sad"
  | "angry";

export const POST_REACTION_TYPES: PostReactionType[] = [
  "like",
  "love",
  "haha",
  "wow",
  "sad",
  "angry",
];

export type AttachmentKind = "image" | "document";

export interface PostAuthor {
  id: string;
  name: string | null;
  email: string;
}

export interface SharedPostPreview {
  id: string;
  body: string;
  createdAt: string;
  author: PostAuthor;
}

export interface PostAttachment {
  id: string;
  uploadId: string;
  kind: AttachmentKind;
  fileName: string;
  mime: string;
  sizeBytes: number;
  url: string;
}

export interface PostComment {
  id: string;
  postId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: PostAuthor;
  /** True when the current viewer can delete this comment. */
  canDelete: boolean;
}

export interface Post {
  id: string;
  body: string;
  visibility: PostVisibility;
  createdAt: string;
  updatedAt: string;
  author: PostAuthor;
  /** Aggregated reaction counts by type. */
  reactions: Record<PostReactionType, number>;
  /** Total reactions (all types). */
  reactionCount: number;
  /** Current viewer's reaction, if any. */
  myReaction: PostReactionType | null;
  /** @deprecated Prefer reactionCount / myReaction — kept for older UI. */
  likeCount: number;
  /** @deprecated Prefer myReaction === 'like'. */
  likedByMe: boolean;
  commentCount: number;
  attachments: PostAttachment[];
  /** Audience user ids when visibility is shared (author-only detail optional). */
  audienceUserIds: string[];
  /** Present when this post is a share/repost of another post. */
  sharedPost: SharedPostPreview | null;
  /** True when the current viewer can delete this post. */
  canDelete: boolean;
}

export interface FeedPage {
  posts: Post[];
  nextCursor: string | null;
}

export interface UploadRecord {
  id: string;
  fileName: string;
  mime: string;
  kind: AttachmentKind;
  sizeBytes: number;
  url: string;
}
