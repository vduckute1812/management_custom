import { describe, expect, it } from "vitest";
import { ReactionType, emptyReactions } from "../types/reaction";
import { applyOptimisticReaction } from "../utils/optimisticReaction";

describe("applyOptimisticReaction", () => {
  it("treats Like (0) as a set, not a clear", () => {
    const next = applyOptimisticReaction(
      { reactions: emptyReactions(), myReaction: null },
      ReactionType.Like,
    );
    expect(next.myReaction).toBe(ReactionType.Like);
    expect(next.reactions[ReactionType.Like]).toBe(1);
    expect(next.reactionCount).toBe(1);
  });

  it("clears only when reaction is null", () => {
    const current = {
      reactions: { ...emptyReactions(), [ReactionType.Like]: 1 },
      myReaction: ReactionType.Like as const,
    };
    const next = applyOptimisticReaction(current, null);
    expect(next.myReaction).toBeNull();
    expect(next.reactions[ReactionType.Like]).toBe(0);
    expect(next.reactionCount).toBe(0);
  });

  it("replaces an existing reaction", () => {
    const current = {
      reactions: { ...emptyReactions(), [ReactionType.Like]: 1 },
      myReaction: ReactionType.Like as const,
    };
    const next = applyOptimisticReaction(current, ReactionType.Love);
    expect(next.myReaction).toBe(ReactionType.Love);
    expect(next.reactions[ReactionType.Like]).toBe(0);
    expect(next.reactions[ReactionType.Love]).toBe(1);
  });
});
