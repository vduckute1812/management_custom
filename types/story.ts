import type { PostAuthor } from "./post";

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
