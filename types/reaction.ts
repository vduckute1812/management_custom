/**
 * Shared reaction types for posts, stories, and chat messages.
 *
 * Integer enum end-to-end (MySQL TINYINT → API JSON → UI). Same values
 * everywhere — no string ↔ number translation at boundaries.
 */

export const ReactionType = {
  Like: 0,
  Love: 1,
  Haha: 2,
  Wow: 3,
  Sad: 4,
  Angry: 5,
} as const;

export type ReactionType = (typeof ReactionType)[keyof typeof ReactionType];

export const REACTION_TYPES = [
  ReactionType.Like,
  ReactionType.Love,
  ReactionType.Haha,
  ReactionType.Wow,
  ReactionType.Sad,
  ReactionType.Angry,
] as const;

export const REACTION_EMOJI: Record<ReactionType, string> = {
  [ReactionType.Like]: "👍",
  [ReactionType.Love]: "❤️",
  [ReactionType.Haha]: "😄",
  [ReactionType.Wow]: "😮",
  [ReactionType.Sad]: "😢",
  [ReactionType.Angry]: "😡",
};

/** i18n key suffix per reaction (`feed.post.reactionLike`, …). */
export const REACTION_I18N_KEY: Record<ReactionType, string> = {
  [ReactionType.Like]: "reactionLike",
  [ReactionType.Love]: "reactionLove",
  [ReactionType.Haha]: "reactionHaha",
  [ReactionType.Wow]: "reactionWow",
  [ReactionType.Sad]: "reactionSad",
  [ReactionType.Angry]: "reactionAngry",
};

export function emptyReactions(): Record<ReactionType, number> {
  return {
    [ReactionType.Like]: 0,
    [ReactionType.Love]: 0,
    [ReactionType.Haha]: 0,
    [ReactionType.Wow]: 0,
    [ReactionType.Sad]: 0,
    [ReactionType.Angry]: 0,
  };
}

export function isReactionType(value: unknown): value is ReactionType {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    (REACTION_TYPES as readonly number[]).includes(value)
  );
}

export function toReactionType(value: unknown): ReactionType | null {
  const n = typeof value === "string" ? Number(value) : value;
  return isReactionType(n) ? n : null;
}

export function reactionCountOf(
  reactions: Record<ReactionType, number> | null | undefined,
): number {
  if (!reactions) return 0;
  let sum = 0;
  for (const key of REACTION_TYPES) {
    sum += reactions[key] ?? 0;
  }
  return sum;
}
