/**
 * Shared domain types for the social Feed tab.
 */

import type { ReactionType } from "./reaction";
import {
  REACTION_TYPES,
  emptyReactions as emptyReactionCounts,
} from "./reaction";

/** Who can see a post — integer end-to-end (MySQL → API → UI). Facebook-style. */
export const PostVisibility = {
  Public: 0,
  Private: 1,
  Shared: 2,
  /** Accepted friends only (author always sees own posts). */
  Friends: 3,
} as const;
export type PostVisibility =
  (typeof PostVisibility)[keyof typeof PostVisibility];
export const POST_VISIBILITIES = [
  PostVisibility.Public,
  PostVisibility.Private,
  PostVisibility.Shared,
  PostVisibility.Friends,
] as const;

/**
 * Content format — short social updates vs long-form manuscripts
 * (essays, thesis chapters, research notes).
 */
export const PostFormat = {
  Update: 0,
  Manuscript: 1,
} as const;
export type PostFormat = (typeof PostFormat)[keyof typeof PostFormat];
export const POST_FORMATS = [PostFormat.Update, PostFormat.Manuscript] as const;

/** Coarse upload / attachment bucket (feed + chat media). */
export const UploadKind = {
  Image: 0,
  Document: 1,
  Audio: 2,
} as const;
export type UploadKind = (typeof UploadKind)[keyof typeof UploadKind];
export const UPLOAD_KINDS = [
  UploadKind.Image,
  UploadKind.Document,
  UploadKind.Audio,
] as const;

/** @deprecated Prefer `UploadKind`. */
export type AttachmentKind = UploadKind;

/** R2 key folder segment for new objects — keeps the bucket browsable. */
export const UPLOAD_KIND_STORAGE_FOLDER: Record<UploadKind, string> = {
  [UploadKind.Image]: "image",
  [UploadKind.Document]: "document",
  [UploadKind.Audio]: "audio",
};

export function isPostVisibility(value: unknown): value is PostVisibility {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    (POST_VISIBILITIES as readonly number[]).includes(value)
  );
}

export function toPostVisibility(value: unknown): PostVisibility {
  const n = typeof value === "string" ? Number(value) : value;
  return isPostVisibility(n) ? n : PostVisibility.Friends;
}

export function isPostFormat(value: unknown): value is PostFormat {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    (POST_FORMATS as readonly number[]).includes(value)
  );
}

export function toPostFormat(value: unknown): PostFormat {
  const n = typeof value === "string" ? Number(value) : value;
  return isPostFormat(n) ? n : PostFormat.Update;
}

export function isUploadKind(value: unknown): value is UploadKind {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    (UPLOAD_KINDS as readonly number[]).includes(value)
  );
}

export function toUploadKind(value: unknown): UploadKind {
  const n = typeof value === "string" ? Number(value) : value;
  return isUploadKind(n) ? n : UploadKind.Image;
}

/** @deprecated Prefer `ReactionType` from `~/types/reaction`. */
export type PostReactionType = ReactionType;

/** @deprecated Prefer `REACTION_TYPES` / `ReactionType` from `~/types/reaction`. */
export const POST_REACTION_TYPES = REACTION_TYPES;

export {
  ReactionType,
  REACTION_TYPES,
  REACTION_EMOJI,
  emptyReactions,
} from "./reaction";

/** @deprecated Prefer `emptyReactions` from `~/types/reaction`. */
export const emptyPostReactions = emptyReactionCounts;

/** Allowed post body fonts (stored as CSS font-family tokens). */
export const POST_FONT_FAMILIES = [
  "default",
  "serif",
  "mono",
  "georgia",
  "comic",
] as const;
export type PostFontFamily = (typeof POST_FONT_FAMILIES)[number];

export const POST_FONT_FAMILY_CSS: Record<PostFontFamily, string> = {
  default: "inherit",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  georgia: "Georgia, serif",
  comic: "'Comic Sans MS', 'Comic Sans', cursive",
};

export const POST_TEXT_COLORS = [
  "default",
  "slate",
  "brand",
  "rose",
  "emerald",
  "amber",
] as const;
export type PostTextColor = (typeof POST_TEXT_COLORS)[number];

export const POST_TEXT_COLOR_CSS: Record<PostTextColor, string> = {
  default: "#1e293b",
  slate: "#334155",
  brand: "#1d4ed8",
  rose: "#e11d48",
  emerald: "#059669",
  amber: "#d97706",
};

export interface PostCategory {
  id: string;
  slug: string;
  name: string;
  sortOrder: number;
  /** Total article count in this directory (present on list endpoints). */
  postCount?: number;
}

/**
 * Seeded directory slugs → i18n keys under `categories.*`.
 * Admin-created directories without a key keep showing the DB `name`.
 * Use: `t(CATEGORY_I18N_KEYS[slug] ?? '', cat.name)` via `categoryDisplayName`.
 */
export const CATEGORY_I18N_KEYS: Record<string, string> = {
  electronics: "categories.electronics",
  "mechanical-engineering": "categories.mechanicalEngineering",
  "information-technology": "categories.informationTechnology",
  iot: "categories.iot",
  general: "categories.general",
  math: "categories.math",
  announcements: "categories.announcements",
  docs: "categories.docs",
  ideas: "categories.ideas",
};

export interface PostAuthor {
  id: string;
  name: string | null;
  email: string;
  /** Proxied upload URL when the author has an avatar. */
  avatarUrl?: string | null;
  title?: string | null;
  job?: string | null;
  location?: string | null;
}

export interface SharedPostPreview {
  id: string;
  title: string | null;
  body: string;
  format: PostFormat;
  createdAt: string;
  author: PostAuthor;
}

/** Sibling locale variant of a multilingual manuscript. */
export interface PostTranslationRef {
  id: string;
  locale: string;
  title: string | null;
}

export interface PostAttachment {
  id: string;
  uploadId: string;
  kind: UploadKind;
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
  /** Short social update or long-form manuscript. */
  format: PostFormat;
  /** Display title — required for manuscripts, unused for updates. */
  title: string | null;
  body: string;
  visibility: PostVisibility;
  category: PostCategory | null;
  fontFamily: PostFontFamily;
  textColor: PostTextColor;
  /**
   * Content language for manuscripts (`en` / `vi` / `zh-CN` / `zh-TW`).
   * Short updates may be `"und"` (unspecified).
   */
  contentLocale: string;
  /** Links locale variants of the same manuscript; null for standalone posts. */
  translationGroupId: string | null;
  /** Sibling locale variants (manuscripts). Omitted/empty when monolingual. */
  translations: PostTranslationRef[];
  createdAt: string;
  updatedAt: string;
  author: PostAuthor;
  /** Aggregated reaction counts by type. */
  reactions: Record<PostReactionType, number>;
  /** Total reactions (all types). */
  reactionCount: number;
  /** Current viewer's reaction, if any. */
  myReaction: PostReactionType | null;
  commentCount: number;
  attachments: PostAttachment[];
  /** Audience user ids when visibility is shared (author-only detail optional). */
  audienceUserIds: string[];
  /** Present when this post is a share/repost of another post. */
  sharedPost: SharedPostPreview | null;
  /** True when the current viewer can edit this post (author). */
  canEdit: boolean;
  /** True when the current viewer can delete this post. */
  canDelete: boolean;
}

export interface FeedPage {
  posts: Post[];
  nextCursor: string | null;
}

/**
 * Single-shot payload for the Feed page first paint: directories + posts
 * (+ stories tray when the viewer is signed in).
 */
export interface FeedBootstrap {
  categories: PostCategory[];
  posts: Post[];
  nextCursor: string | null;
  /** Null for anonymous visitors (stories require auth). */
  stories: import("./story").StoriesTray | null;
}

export interface UploadRecord {
  id: string;
  fileName: string;
  mime: string;
  kind: UploadKind;
  sizeBytes: number;
  url: string;
}
