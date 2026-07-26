import type { PostAuthor, PostReactionType } from "./post";

export interface Story {
  id: string;
  body: string | null;
  mime: string | null;
  mediaUrl: string | null;
  createdAt: string;
  expiresAt: string;
  author: PostAuthor;
  viewedByMe: boolean;
  canDelete: boolean;
  /** Aggregated reaction counts (always present; zeros when none). */
  reactions: Record<PostReactionType, number>;
  reactionCount: number;
  myReaction: PostReactionType | null;
  /** View count — populated for the story owner; 0 for others. */
  viewCount: number;
}

export interface StoryAuthorGroup {
  author: PostAuthor;
  stories: Story[];
  /** True when the viewer has unseen stories in this group. */
  hasUnseen: boolean;
}

export interface StoriesTray {
  groups: StoryAuthorGroup[];
}

export interface StoryViewerEntry {
  user: PostAuthor;
  viewedAt: string;
  reaction: PostReactionType | null;
}

export interface StoryInsights {
  storyId: string;
  viewCount: number;
  viewers: StoryViewerEntry[];
  reactions: Record<PostReactionType, number>;
  reactionCount: number;
  reactionUsers: Array<{
    user: PostAuthor;
    reaction: PostReactionType;
    createdAt: string;
  }>;
}
