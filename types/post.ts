/**
 * Shared domain types for the social Feed tab.
 */

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
  createdAt: string;
  updatedAt: string;
  author: PostAuthor;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  /** Present when this post is a share/repost of another post. */
  sharedPost: SharedPostPreview | null;
  /** True when the current viewer can delete this post. */
  canDelete: boolean;
}

export interface FeedPage {
  posts: Post[];
  nextCursor: string | null;
}
