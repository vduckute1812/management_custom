import {
  REACTION_TYPES,
  emptyReactions,
  type ReactionType,
} from "~/types/reaction";

/**
 * Apply an optimistic reaction change. Uses `!= null` so `ReactionType.Like`
 * (`0`) is never treated as "clear".
 */
export function applyOptimisticReaction(
  current: {
    reactions: Record<ReactionType, number> | null | undefined;
    myReaction: ReactionType | null | undefined;
  },
  reaction: ReactionType | null,
): {
  reactions: Record<ReactionType, number>;
  reactionCount: number;
  myReaction: ReactionType | null;
} {
  const reactions = { ...(current.reactions ?? emptyReactions()) };
  if (current.myReaction != null) {
    reactions[current.myReaction] = Math.max(
      0,
      reactions[current.myReaction] - 1,
    );
  }
  if (reaction != null) {
    reactions[reaction] = (reactions[reaction] ?? 0) + 1;
  }
  const reactionCount = REACTION_TYPES.reduce<number>(
    (sum, key) => sum + (reactions[key] ?? 0),
    0,
  );
  return { reactions, reactionCount, myReaction: reaction };
}
